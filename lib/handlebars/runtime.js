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

// Maximum number of nested partial invocations allowed within a single render.
// Flat partial calls (e.g. one partial per comment in a long list) do not nest
// and therefore do not count against this limit.
export const DEFAULT_MAX_PARTIAL_DEPTH = 200;

// Internal option/container keys used to propagate the per-render partial
// nesting state. They are Symbol-keyed so they never collide with user data.
const PARTIAL_DEPTH_CTX = Symbol('partialDepthContext');
const PARTIAL_DEPTH_VALUE = Symbol('partialDepthValue');

export function normalizeMaxPartialDepth(value) {
  if (
    typeof value === 'number' &&
    value > 0 &&
    value !== Infinity &&
    Math.floor(value) === value
  ) {
    return value;
  }
  return undefined;
}

function resolveMaxPartialDepth(runtimeOptions, compilerOptions, templateSpec) {
  // Runtime options win over compile options, which win over the value baked
  // into a precompiled template spec.
  return (
    normalizeMaxPartialDepth(
      runtimeOptions && runtimeOptions.maxPartialDepth
    ) ||
    normalizeMaxPartialDepth(
      compilerOptions && compilerOptions.maxPartialDepth
    ) ||
    normalizeMaxPartialDepth(templateSpec && templateSpec.maxPartialDepth) ||
    DEFAULT_MAX_PARTIAL_DEPTH
  );
}

function buildPartialDepthMessage(ctx, depth, nextName) {
  nextName = nextName != null ? String(nextName) : '(anonymous)';
  // ctx.names is a fixed slot array; only the entries up to the current depth
  // belong to this chain.
  const chain = ctx.names.slice(0, depth).concat(nextName);
  return (
    'Partial nesting depth exceeded the maxPartialDepth limit of ' +
    ctx.limit +
    ' (reached depth ' +
    chain.length +
    ' while entering "' +
    nextName +
    '"). Partial chain: ' +
    formatPartialChain(chain)
  );
}

// Renders "a -> b -> ... -> z", collapsing the middle of long chains while
// always keeping the first and last few names visible.
function formatPartialChain(names) {
  const headCount = 5;
  const tailCount = 3;

  if (names.length <= headCount + tailCount + 1) {
    return names.join(' -> ');
  }

  const omitted = names.length - headCount - tailCount;
  return (
    names.slice(0, headCount).join(' -> ') +
    ' -> ... (' +
    omitted +
    ' more) -> ' +
    names.slice(names.length - tailCount).join(' -> ')
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

    // Every way of entering a partial (static, dynamic, block, inline or
    // @partial-block) goes through this wrapper, so this is the single place
    // where nesting depth is counted. The enclosing depth normally lives on
    // the currently rendering template's container (`this`); it may also be
    // forwarded on `options` (a partial-block body program executing in a
    // different template's scope) or on the data frame. The value is
    // immutable, so no decrement is required when rendering unwinds and user
    // helpers that catch exceptions cannot desync the counter.
    let ctx = this[PARTIAL_DEPTH_CTX];
    let parentDepth = this[PARTIAL_DEPTH_VALUE] || 0;
    if (options[PARTIAL_DEPTH_VALUE]) {
      parentDepth = options[PARTIAL_DEPTH_VALUE];
      ctx = options[PARTIAL_DEPTH_CTX];
    } else if (!parentDepth && options.data) {
      parentDepth = options.data[PARTIAL_DEPTH_VALUE] || 0;
      ctx = options.data[PARTIAL_DEPTH_CTX] || ctx;
    }
    const depth = parentDepth + 1;

    if (depth > ctx.limit) {
      throw new Exception(
        buildPartialDepthMessage(ctx, parentDepth, options.name)
      );
    }

    // Record the name of this frame so it can be reported in the chain when a
    // deeper frame overflows. Fixed slots are reused by sibling invocations.
    ctx.names[parentDepth] = options.name;
    options[PARTIAL_DEPTH_VALUE] = depth;
    options[PARTIAL_DEPTH_CTX] = ctx;

    let result = env.VM.invokePartial.call(this, partial, context, options);

    if (result == null && env.compile) {
      options.partials[options.name] = env.compile(
        partial,
        templateSpec.compilerOptions,
        env
      );
      result = options.partials[options.name](context, options);
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
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }

    // A fresh partial-depth context is created for every top-level render, so
    // the nesting counters of separate renders never interfere with each other.
    // Nested partial renders reuse the context handed to them via options.
    const previousCtx = container[PARTIAL_DEPTH_CTX];
    const previousDepth = container[PARTIAL_DEPTH_VALUE];
    container[PARTIAL_DEPTH_CTX] = options[PARTIAL_DEPTH_CTX] || {
      limit: resolveMaxPartialDepth(
        options,
        templateSpec.compilerOptions,
        templateSpec
      ),
      names: [],
    };
    // The depth this template is rendering at. It lets opcodes of this
    // template call further partials even when the nested call uses a freshly
    // built options/data object (e.g. from inside a block helper).
    container[PARTIAL_DEPTH_VALUE] =
      options[PARTIAL_DEPTH_VALUE] || (data && data[PARTIAL_DEPTH_VALUE]) || 0;

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
    const result = main(context, options);
    // Rendering is synchronous. Restoring the outer depth after the render
    // returns keeps sibling partial invocations independent; if the render
    // unwound because an exception propagated, the whole chain unwinds with
    // it and nobody observes the temporary stamp left behind.
    container[PARTIAL_DEPTH_VALUE] = previousDepth;
    container[PARTIAL_DEPTH_CTX] = previousCtx;
    return result;
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

    let currentData = options.data || data;

    // A program executed as a partial's inline body (or as @partial-block)
    // runs from within another partial's render. Forward the enclosing depth
    // so partials called from inside this body are nested correctly instead of
    // appearing at depth 0. Ordinary block-helper programs (each, with, ...)
    // never carry the marker and are left untouched.
    const enclosingDepth = options[PARTIAL_DEPTH_VALUE];
    if (enclosingDepth !== undefined) {
      if (currentData) {
        // New frame: siblings (e.g. each iterations of other partials) must
        // not see this frame's depth through the shared parent frame.
        currentData = createFrame(currentData);
        currentData[PARTIAL_DEPTH_VALUE] = enclosingDepth;
        currentData[PARTIAL_DEPTH_CTX] = options[PARTIAL_DEPTH_CTX];
      } else {
        // data:false leaves no frame to carry the value. Stamp the container
        // for the synchronous execution of this one program and restore it
        // afterwards.
        const previousDepth = container[PARTIAL_DEPTH_VALUE];
        const previousCtx = container[PARTIAL_DEPTH_CTX];
        container[PARTIAL_DEPTH_VALUE] = enclosingDepth;
        container[PARTIAL_DEPTH_CTX] = options[PARTIAL_DEPTH_CTX];
        try {
          return fn(
            container,
            context,
            container.helpers,
            container.partials,
            currentData,
            blockParams && [options.blockParams].concat(blockParams),
            currentDepths
          );
        } finally {
          container[PARTIAL_DEPTH_VALUE] = previousDepth;
          container[PARTIAL_DEPTH_CTX] = previousCtx;
        }
      }
    }

    return fn(
      container,
      context,
      container.helpers,
      container.partials,
      currentData,
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
      // The depth/context symbols are already on this `options`; the block
      // program forwards them itself (see wrapProgram).
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
