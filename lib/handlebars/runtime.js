import { Exception } from '@handlebars/parser';
import * as Utils from './utils.js';
import {
  COMPILER_REVISION,
  createFrame,
  LAST_COMPATIBLE_COMPILER_REVISION,
  REVISION_CHANGES,
} from './base.js';
import { moveHelperToHooks } from './helpers.js';
import { wrapHelper } from './internal/wrapHelper.js';
import {
  createProtoAccessControl,
  resultIsAllowed,
} from './internal/proto-access.js';

/**
 * Default maximum nesting depth of partial calls within a single render.
 *
 * Normal comment trees stay well below this (depth <= 100), while the JS stack
 * only overflows around 300-400 nested partial frames even with heavier
 * templates, so the guard always fires before a RangeError can occur.
 */
export const DEFAULT_MAX_PARTIAL_DEPTH = 200;

/**
 * Key on the per-render `hooks` object carrying the partial nesting state for
 * the render: `{ max, names }`. `hooks` is created fresh for every top-level
 * template invocation and propagated unchanged to every nested partial, so the
 * state is naturally scoped to a single render (flat sibling partials see the
 * chain popped on return). The property is absent when the limit is disabled
 * (maxPartialDepth 0), keeping the hot path to a single property lookup.
 *
 * A plain (underscore-prefixed) key rather than a Symbol is used on purpose:
 * V8 optimizes this hot wrapper substantially worse with a Symbol-keyed load.
 */
const partialDepthKey = '_handlebarsPartialDepth';

/**
 * Validate a maxPartialDepth value: it must be a non-negative integer.
 * `0` disables the partial nesting depth limit. Used both at compile time
 * (see compiler.js) and at render time.
 */
export function validateMaxPartialDepth(value, phase) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Exception(
      'maxPartialDepth must be a non-negative integer, got ' +
        String(value) +
        ' (in ' +
        phase +
        ' options). Pass 0 to disable the partial nesting depth limit.'
    );
  }
}

/**
 * Resolve the effective maxPartialDepth, preferring the runtime option over
 * the value baked in at compile time. Any supplied value must be a non-negative
 * integer; 0 disables the limit.
 */
function resolveMaxPartialDepth(runtimeOption, compileOption) {
  if (runtimeOption !== undefined && runtimeOption !== null) {
    validateMaxPartialDepth(runtimeOption, 'runtime');
    return runtimeOption;
  }
  if (compileOption !== undefined && compileOption !== null) {
    // Compile-time values were validated already, but re-validate to stay safe
    // with hand-written/precompiled template specs.
    validateMaxPartialDepth(compileOption, 'compile');
    return compileOption;
  }
  return DEFAULT_MAX_PARTIAL_DEPTH;
}

function formatPartialChain(names) {
  const headCount = 10;
  if (names.length <= headCount * 2) {
    return names.join(' > ');
  }
  return (
    names.slice(0, headCount).join(' > ') +
    ' > ...(' +
    (names.length - headCount * 2) +
    ' more)... > ' +
    names.slice(names.length - headCount).join(' > ')
  );
}

export function checkRevision(compilerInfo) {
  const compilerRevision = (compilerInfo && compilerInfo[0]) || 1,
    currentRevision = COMPILER_REVISION;

  if (
    compilerRevision >= LAST_COMPATIBLE_COMPILER_REVISION &&
    compilerRevision <= COMPILER_REVISION
  ) {
    return;
  }

  if (compilerRevision < LAST_COMPATIBLE_COMPILER_REVISION) {
    const runtimeVersions = REVISION_CHANGES[currentRevision],
      compilerVersions = REVISION_CHANGES[compilerRevision];
    throw new Exception(
      'Template was precompiled with an older version of Handlebars than the current runtime. ' +
        'Please update your precompiler to a newer version (' +
        runtimeVersions +
        ') or downgrade your runtime to an older version (' +
        compilerVersions +
        ').'
    );
  } else {
    // Use the embedded version info since the runtime doesn't know about this revision yet
    throw new Exception(
      'Template was precompiled with a newer version of Handlebars than the current runtime. ' +
        'Please update your runtime to a newer version (' +
        compilerInfo[1] +
        ').'
    );
  }
}

export function template(templateSpec, env) {
  /* v8 ignore next */
  if (!env) {
    throw new Exception('No environment passed to template');
  }
  if (!templateSpec || !templateSpec.main) {
    throw new Exception('Unknown template object: ' + typeof templateSpec);
  }

  templateSpec.main.decorator = templateSpec.main_d;

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as pseudo-supported APIs.
  env.VM.checkRevision(templateSpec.compiler);

  // backwards compatibility for precompiled templates with compiler-version 7 (<4.3.0)
  const templateWasPrecompiledWithCompilerV7 =
    templateSpec.compiler && templateSpec.compiler[0] === 7;

  function invokePartialWrapper(partial, context, options) {
    if (options.hash) {
      context = Utils.extend({}, context, options.hash);
    }
    partial = env.VM.resolvePartial.call(this, partial, context, options);

    options.hooks = this.hooks;
    options.protoAccessControl = this.protoAccessControl;

    // Enforce the per-render partial nesting depth limit. Every way of
    // entering a partial (static, dynamic, block, ...) compiles to this call,
    // so there is no way to bypass the guard, while each/with block helpers
    // never reach here and therefore don't count.
    //
    // The chain lives on the per-render hooks object (the same instance across
    // every nested partial, recreated per top-level invocation), so sibling
    // partials don't accumulate. It is popped in finally so a non-limit error
    // caught by a user helper cannot leave a stale entry on the chain.
    const partialDepth = this.hooks[partialDepthKey];
    if (partialDepth) {
      const names = partialDepth.names || (partialDepth.names = []);
      const depth = names.push(options.name);
      if (depth > partialDepth.max) {
        throw new Exception(
          'Partial nesting depth of ' +
            depth +
            ' exceeded the maxPartialDepth of ' +
            partialDepth.max +
            '. Partial chain (outermost to innermost): ' +
            formatPartialChain(names)
        );
      }
    }

    let result;
    try {
      result = env.VM.invokePartial.call(this, partial, context, options);

      if (result == null && env.compile) {
        options.partials[options.name] = env.compile(
          partial,
          templateSpec.compilerOptions,
          env
        );
        result = options.partials[options.name](context, options);
      }
    } finally {
      if (partialDepth) {
        partialDepth.names.pop();
      }
    }
    if (result != null) {
      if (options.indent) {
        let lines = result.split('\n');
        for (let i = 0, l = lines.length; i < l; i++) {
          if (!lines[i] && i + 1 === l) {
            break;
          }

          lines[i] = options.indent + lines[i];
        }
        result = lines.join('\n');
      }
      return result;
    } else {
      throw new Exception(
        'The partial ' +
          options.name +
          ' could not be compiled when running in runtime-only mode'
      );
    }
  }

  // Just add water
  let container = {
    strict: function (obj, name, loc) {
      if (!obj || !(name in obj)) {
        throw new Exception('"' + name + '" not defined in ' + obj, {
          loc: loc,
        });
      }
      return container.lookupProperty(obj, name);
    },
    lookupProperty: function (parent, propertyName) {
      if (Utils.isMap(parent)) {
        return parent.get(propertyName);
      }

      let result = parent[propertyName];
      if (result == null) {
        return result;
      }
      if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
        return result;
      }

      if (resultIsAllowed(result, container.protoAccessControl, propertyName)) {
        return result;
      }
      return undefined;
    },
    lookup: function (depths, name) {
      const len = depths.length;
      for (let i = 0; i < len; i++) {
        let result = depths[i] && container.lookupProperty(depths[i], name);
        if (result != null) {
          return depths[i][name];
        }
      }
    },
    lambda: function (current, context) {
      return typeof current === 'function' ? current.call(context) : current;
    },

    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,

    fn: function (i) {
      let ret = templateSpec[i];
      ret.decorator = templateSpec[i + '_d'];
      return ret;
    },

    programs: [],
    program: function (i, data, declaredBlockParams, blockParams, depths) {
      let programWrapper = this.programs[i],
        fn = this.fn(i);
      if (data || depths || blockParams || declaredBlockParams) {
        programWrapper = wrapProgram(
          this,
          i,
          fn,
          data,
          declaredBlockParams,
          blockParams,
          depths
        );
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = wrapProgram(this, i, fn);
      }
      return programWrapper;
    },

    data: function (value, depth) {
      while (value && depth--) {
        value = value._parent;
      }
      return value;
    },
    mergeIfNeeded: function (param, common) {
      let obj = param || common;

      if (param && common && param !== common) {
        obj = Utils.extend({}, common, param);
      }

      return obj;
    },
    // An empty object to use as replacement for null-contexts
    nullContext: Object.seal({}),

    noop: env.VM.noop,
    compilerInfo: templateSpec.compiler,
  };

  function ret(context, options = {}) {
    let data = options.data;

    _setup(options);
    if (!options.partial) {
      // Resolve the effective depth limit once per top-level render. Runtime
      // options override the compile-time setting. The state object is carried
      // through every nested partial via the shared hooks object (see
      // invokePartialWrapper below), so each render's counting is independent.
      const maxDepth = resolveMaxPartialDepth(
        options.maxPartialDepth,
        templateSpec.maxPartialDepth
      );
      if (maxDepth) {
        container.hooks[partialDepthKey] = { max: maxDepth, names: null };
      }
    }
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }
    let depths,
      blockParams = templateSpec.useBlockParams ? [] : undefined;
    if (templateSpec.useDepths) {
      if (options.depths) {
        depths =
          context != options.depths[0]
            ? [context].concat(options.depths)
            : options.depths;
      } else {
        depths = [context];
      }
    }

    function main(context /*, options*/) {
      return (
        '' +
        templateSpec.main(
          container,
          context,
          container.helpers,
          container.partials,
          data,
          blockParams,
          depths
        )
      );
    }

    main = executeDecorators(
      templateSpec.main,
      main,
      container,
      options.depths || [],
      data,
      blockParams
    );
    return main(context, options);
  }

  ret.isTop = true;

  function _setup(options) {
    if (!options.partial) {
      let mergedHelpers = {};
      addHelpers(mergedHelpers, env.helpers, container);
      addHelpers(mergedHelpers, options.helpers, container);
      container.helpers = mergedHelpers;

      if (templateSpec.usePartial) {
        // Use mergeIfNeeded here to prevent compiling global partials multiple times
        container.partials = container.mergeIfNeeded(
          options.partials,
          env.partials
        );
      }
      if (templateSpec.usePartial || templateSpec.useDecorators) {
        container.decorators = Utils.extend(
          {},
          env.decorators,
          options.decorators
        );
      }

      container.hooks = {};
      container.protoAccessControl = createProtoAccessControl(options);

      let keepHelperInHelpers =
        options.allowCallsToHelperMissing ||
        templateWasPrecompiledWithCompilerV7;
      moveHelperToHooks(container, 'helperMissing', keepHelperInHelpers);
      moveHelperToHooks(container, 'blockHelperMissing', keepHelperInHelpers);
    } else {
      container.protoAccessControl = options.protoAccessControl; // internal option
      container.helpers = options.helpers;
      container.partials = options.partials;
      container.decorators = options.decorators;
      container.hooks = options.hooks;
    }
  }

  return ret;
}

export function wrapProgram(
  container,
  i,
  fn,
  data,
  declaredBlockParams,
  blockParams,
  depths
) {
  function prog(context, options = {}) {
    let currentDepths = depths;
    if (
      depths &&
      context != depths[0] &&
      !(context === container.nullContext && depths[0] === null)
    ) {
      currentDepths = [context].concat(depths);
    }

    return fn(
      container,
      context,
      container.helpers,
      container.partials,
      options.data || data,
      blockParams && [options.blockParams].concat(blockParams),
      currentDepths
    );
  }

  prog = executeDecorators(fn, prog, container, depths, data, blockParams);

  prog.program = i;
  prog.depth = depths ? depths.length : 0;
  prog.blockParams = declaredBlockParams || 0;
  return prog;
}

/**
 * This is currently part of the official API, therefore implementation details should not be changed.
 */
export function resolvePartial(partial, context, options) {
  if (!partial) {
    if (options.name === '@partial-block') {
      partial = options.data['partial-block'];
    } else {
      partial = options.partials[options.name];
    }
  } else if (!partial.call && !options.name) {
    // This is a dynamic partial that returned a string
    options.name = partial;
    partial = options.partials[partial];
  }
  return partial;
}

export function invokePartial(partial, context, options) {
  // Use the current closure context to save the partial-block if this partial
  const currentPartialBlock = options.data && options.data['partial-block'];
  options.partial = true;

  let partialBlock;
  if (options.fn && options.fn !== noop) {
    options.data = createFrame(options.data);
    // Wrapper function to get access to currentPartialBlock from the closure
    let fn = options.fn;
    partialBlock = options.data['partial-block'] = function partialBlockWrapper(
      context,
      options = {}
    ) {
      // Restore the partial-block from the closure for the execution of the block
      // i.e. the part inside the block of the partial call.
      options.data = createFrame(options.data);
      options.data['partial-block'] = currentPartialBlock;
      return fn(context, options);
    };
    if (fn.partials) {
      options.partials = Utils.extend({}, options.partials, fn.partials);
    }
  }

  if (partial === undefined && partialBlock) {
    partial = partialBlock;
  }

  if (partial === undefined) {
    throw new Exception(
      'The partial "' + options.name + '" could not be found'
    );
  } else if (partial instanceof Function) {
    return partial(context, options);
  }
}

export function noop() {
  return '';
}

function initData(context, data) {
  if (!data || !('root' in data)) {
    data = data ? createFrame(data) : {};
    data.root = context;
  }
  return data;
}

function executeDecorators(fn, prog, container, depths, data, blockParams) {
  if (fn.decorator) {
    let props = {};
    prog = fn.decorator(
      prog,
      props,
      container,
      depths && depths[0],
      data,
      blockParams,
      depths
    );
    Utils.extend(prog, props);
  }
  return prog;
}

function addHelpers(mergedHelpers, helpers, container) {
  if (!helpers) return;
  Object.keys(helpers).forEach((helperName) => {
    let helper = helpers[helperName];
    mergedHelpers[helperName] = passLookupPropertyOption(helper, container);
  });
}

function passLookupPropertyOption(helper, container) {
  const lookupProperty = container.lookupProperty;
  return wrapHelper(helper, (options) => {
    options.lookupProperty = lookupProperty;
    return options;
  });
}
