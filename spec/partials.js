describe('partials', function () {
  it('basic partials', function () {
    var string = 'Dudes: {{#dudes}}{{> dude}}{{/dudes}}';
    var partial = '{{name}} ({{url}}) ';
    var hash = {
      dudes: [
        { name: 'Yehuda', url: 'http://yehuda' },
        { name: 'Alan', url: 'http://alan' },
      ],
    };

    expectTemplate(string)
      .withInput(hash)
      .withPartials({ dude: partial })
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');

    expectTemplate(string)
      .withInput(hash)
      .withPartials({ dude: partial })
      .withRuntimeOptions({ data: false })
      .withCompileOptions({ data: false })
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');
  });

  it('dynamic partials', function () {
    var string = 'Dudes: {{#dudes}}{{> (partial)}}{{/dudes}}';
    var partial = '{{name}} ({{url}}) ';
    var hash = {
      dudes: [
        { name: 'Yehuda', url: 'http://yehuda' },
        { name: 'Alan', url: 'http://alan' },
      ],
    };
    var helpers = {
      partial: function () {
        return 'dude';
      },
    };

    expectTemplate(string)
      .withInput(hash)
      .withHelpers(helpers)
      .withPartials({ dude: partial })
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');

    expectTemplate(string)
      .withInput(hash)
      .withHelpers(helpers)
      .withPartials({ dude: partial })
      .withRuntimeOptions({ data: false })
      .withCompileOptions({ data: false })
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');
  });

  it('failing dynamic partials', function () {
    expectTemplate('Dudes: {{#dudes}}{{> (partial)}}{{/dudes}}')
      .withInput({
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withHelper('partial', function () {
        return 'missing';
      })
      .withPartial('dude', '{{name}} ({{url}}) ')
      .toThrow(
        Handlebars.Exception,
        'The partial "missing" could not be found'
      );
  });

  it('partials with context', function () {
    expectTemplate('Dudes: {{>dude dudes}}')
      .withInput({
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withPartial('dude', '{{#this}}{{name}} ({{url}}) {{/this}}')
      .withMessage('Partials can be passed a context')
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');
  });

  it('partials with no context', function () {
    var partial = '{{name}} ({{url}}) ';
    var hash = {
      dudes: [
        { name: 'Yehuda', url: 'http://yehuda' },
        { name: 'Alan', url: 'http://alan' },
      ],
    };

    expectTemplate('Dudes: {{#dudes}}{{>dude}}{{/dudes}}')
      .withInput(hash)
      .withPartial('dude', partial)
      .withCompileOptions({ explicitPartialContext: true })
      .toCompileTo('Dudes:  ()  () ');

    expectTemplate('Dudes: {{#dudes}}{{>dude name="foo"}}{{/dudes}}')
      .withInput(hash)
      .withPartial('dude', partial)
      .withCompileOptions({ explicitPartialContext: true })
      .toCompileTo('Dudes: foo () foo () ');
  });

  it('partials with string context', function () {
    expectTemplate('Dudes: {{>dude "dudes"}}')
      .withPartial('dude', '{{.}}')
      .toCompileTo('Dudes: dudes');
  });

  it('partials with undefined context', function () {
    expectTemplate('Dudes: {{>dude dudes}}')
      .withPartial('dude', '{{foo}} Empty')
      .toCompileTo('Dudes:  Empty');
  });

  it('partials with duplicate parameters', function () {
    expectTemplate('Dudes: {{>dude dudes foo bar=baz}}').toThrow(
      Error,
      'Unsupported number of partial arguments: 2 - 1:7'
    );
  });

  it('partials with parameters', function () {
    expectTemplate('Dudes: {{#dudes}}{{> dude others=..}}{{/dudes}}')
      .withInput({
        foo: 'bar',
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withPartial('dude', '{{others.foo}}{{name}} ({{url}}) ')
      .withMessage('Basic partials output based on current context.')
      .toCompileTo('Dudes: barYehuda (http://yehuda) barAlan (http://alan) ');
  });

  it('partial in a partial', function () {
    expectTemplate('Dudes: {{#dudes}}{{>dude}}{{/dudes}}')
      .withInput({
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withPartials({
        dude: '{{name}} {{> url}} ',
        url: '<a href="{{url}}">{{url}}</a>',
      })
      .withMessage('Partials are rendered inside of other partials')
      .toCompileTo(
        'Dudes: Yehuda <a href="http://yehuda">http://yehuda</a> Alan <a href="http://alan">http://alan</a> '
      );
  });

  it('rendering undefined partial throws an exception', function () {
    expectTemplate('{{> whatever}}').toThrow(
      Handlebars.Exception,
      'The partial "whatever" could not be found'
    );
  });

  it('registering undefined partial throws an exception', function () {
    expect(function () {
      handlebarsEnv.registerPartial('undefined_test', undefined);
    }).toThrow(
      'Attempting to register a partial called "undefined_test" as undefined'
    );
  });

  it('rendering template partial in vm mode throws an exception', function () {
    expectTemplate('{{> whatever}}').toThrow(
      Handlebars.Exception,
      'The partial "whatever" could not be found'
    );
  });

  it('rendering function partial in vm mode', function () {
    function partial(context) {
      return context.name + ' (' + context.url + ') ';
    }
    expectTemplate('Dudes: {{#dudes}}{{> dude}}{{/dudes}}')
      .withInput({
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withPartial('dude', partial)
      .withMessage('Function partials output based in VM.')
      .toCompileTo('Dudes: Yehuda (http://yehuda) Alan (http://alan) ');
  });

  it('GH-14: a partial preceding a selector', function () {
    expectTemplate('Dudes: {{>dude}} {{anotherDude}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('dude', '{{name}}')
      .withMessage('Regular selectors can follow a partial')
      .toCompileTo('Dudes: Jeepers Creepers');
  });

  it('Partials with slash paths', function () {
    expectTemplate('Dudes: {{> shared/dude}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('shared/dude', '{{name}}')
      .withMessage('Partials can use literal paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('Partials with slash and point paths', function () {
    expectTemplate('Dudes: {{> shared/dude.thing}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('shared/dude.thing', '{{name}}')
      .withMessage('Partials can use literal with points in paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('Global Partials', function () {
    handlebarsEnv.registerPartial('globalTest', '{{anotherDude}}');

    expectTemplate('Dudes: {{> shared/dude}} {{> globalTest}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('shared/dude', '{{name}}')
      .withMessage('Partials can use globals or passed')
      .toCompileTo('Dudes: Jeepers Creepers');

    handlebarsEnv.unregisterPartial('globalTest');
    expect(handlebarsEnv.partials.globalTest).toBeUndefined();
  });

  it('Multiple partial registration', function () {
    handlebarsEnv.registerPartial({
      'shared/dude': '{{name}}',
      globalTest: '{{anotherDude}}',
    });

    expectTemplate('Dudes: {{> shared/dude}} {{> globalTest}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('notused', 'notused') // trick the test bench into running with partials enabled
      .withMessage('Partials can use globals or passed')
      .toCompileTo('Dudes: Jeepers Creepers');
  });

  it('Partials with integer path', function () {
    expectTemplate('Dudes: {{> 404}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial(404, '{{name}}')
      .withMessage('Partials can use literal paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('Partials with complex path', function () {
    expectTemplate('Dudes: {{> 404/asdf?.bar}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('404/asdf?.bar', '{{name}}')
      .withMessage('Partials can use literal paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('Partials with escaped', function () {
    expectTemplate('Dudes: {{> [+404/asdf?.bar]}}')
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('+404/asdf?.bar', '{{name}}')
      .withMessage('Partials can use literal paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('Partials with string', function () {
    expectTemplate("Dudes: {{> '+404/asdf?.bar'}}")
      .withInput({ name: 'Jeepers', anotherDude: 'Creepers' })
      .withPartial('+404/asdf?.bar', '{{name}}')
      .withMessage('Partials can use literal paths')
      .toCompileTo('Dudes: Jeepers');
  });

  it('should handle empty partial', function () {
    expectTemplate('Dudes: {{#dudes}}{{> dude}}{{/dudes}}')
      .withInput({
        dudes: [
          { name: 'Yehuda', url: 'http://yehuda' },
          { name: 'Alan', url: 'http://alan' },
        ],
      })
      .withPartial('dude', '')
      .toCompileTo('Dudes: ');
  });

  it('throw on missing partial', function () {
    var compile = handlebarsEnv.compile;
    var compileWithPartial = CompilerContext.compileWithPartial;
    handlebarsEnv.compile = undefined;
    CompilerContext.compileWithPartial = CompilerContext.compile;
    expectTemplate('{{> dude}}')
      .withPartials({ dude: 'fail' })
      .toThrow(Error, /The partial dude could not be compiled/);
    handlebarsEnv.compile = compile;
    CompilerContext.compileWithPartial = compileWithPartial;
  });

  describe('partial blocks', function () {
    it('should render partial block as default', function () {
      expectTemplate('{{#> dude}}success{{/dude}}').toCompileTo('success');
    });

    it('should execute default block with proper context', function () {
      expectTemplate('{{#> dude context}}{{value}}{{/dude}}')
        .withInput({ context: { value: 'success' } })
        .toCompileTo('success');
    });

    it('should propagate block parameters to default block', function () {
      expectTemplate(
        '{{#with context as |me|}}{{#> dude}}{{me.value}}{{/dude}}{{/with}}'
      )
        .withInput({ context: { value: 'success' } })
        .toCompileTo('success');
    });

    it('should not use partial block if partial exists', function () {
      expectTemplate('{{#> dude}}fail{{/dude}}')
        .withPartials({ dude: 'success' })
        .toCompileTo('success');
    });

    it('should render block from partial', function () {
      expectTemplate('{{#> dude}}success{{/dude}}')
        .withPartials({ dude: '{{> @partial-block }}' })
        .toCompileTo('success');
    });

    it('should be able to render the partial-block twice', function () {
      expectTemplate('{{#> dude}}success{{/dude}}')
        .withPartials({ dude: '{{> @partial-block }} {{> @partial-block }}' })
        .toCompileTo('success success');
    });

    it('should render block from partial with context', function () {
      expectTemplate('{{#> dude}}{{value}}{{/dude}}')
        .withInput({ context: { value: 'success' } })
        .withPartials({
          dude: '{{#with context}}{{> @partial-block }}{{/with}}',
        })
        .toCompileTo('success');
    });

    it('should be able to access the @data frame from a partial-block', function () {
      expectTemplate('{{#> dude}}in-block: {{@root/value}}{{/dude}}')
        .withInput({ value: 'success' })
        .withPartials({
          dude: '<code>before-block: {{@root/value}} {{>   @partial-block }}</code>',
        })
        .toCompileTo('<code>before-block: success in-block: success</code>');
    });

    it('should allow the #each-helper to be used along with partial-blocks', function () {
      expectTemplate(
        '<template>{{#> list value}}value = {{.}}{{/list}}</template>'
      )
        .withInput({
          value: ['a', 'b', 'c'],
        })
        .withPartials({
          list: '<list>{{#each .}}<item>{{> @partial-block}}</item>{{/each}}</list>',
        })
        .toCompileTo(
          '<template><list><item>value = a</item><item>value = b</item><item>value = c</item></list></template>'
        );
    });

    it('should render block from partial with context (twice)', function () {
      expectTemplate('{{#> dude}}{{value}}{{/dude}}')
        .withInput({ context: { value: 'success' } })
        .withPartials({
          dude: '{{#with context}}{{> @partial-block }} {{> @partial-block }}{{/with}}',
        })
        .toCompileTo('success success');
    });

    it('should render block from partial with context', function () {
      expectTemplate('{{#> dude}}{{../context/value}}{{/dude}}')
        .withInput({ context: { value: 'success' } })
        .withPartials({
          dude: '{{#with context}}{{> @partial-block }}{{/with}}',
        })
        .toCompileTo('success');
    });

    it('should render block from partial with block params', function () {
      expectTemplate(
        '{{#with context as |me|}}{{#> dude}}{{me.value}}{{/dude}}{{/with}}'
      )
        .withInput({ context: { value: 'success' } })
        .withPartials({ dude: '{{> @partial-block }}' })
        .toCompileTo('success');
    });

    it('should render nested partial blocks', function () {
      expectTemplate('<template>{{#> outer}}{{value}}{{/outer}}</template>')
        .withInput({ value: 'success' })
        .withPartials({
          outer:
            '<outer>{{#> nested}}<outer-block>{{> @partial-block}}</outer-block>{{/nested}}</outer>',
          nested: '<nested>{{> @partial-block}}</nested>',
        })
        .toCompileTo(
          '<template><outer><nested><outer-block>success</outer-block></nested></outer></template>'
        );
    });

    it('should render nested partial blocks at different nesting levels', function () {
      expectTemplate('<template>{{#> outer}}{{value}}{{/outer}}</template>')
        .withInput({ value: 'success' })
        .withPartials({
          outer:
            '<outer>{{#> nested}}<outer-block>{{> @partial-block}}</outer-block>{{/nested}}{{> @partial-block}}</outer>',
          nested: '<nested>{{> @partial-block}}</nested>',
        })
        .toCompileTo(
          '<template><outer><nested><outer-block>success</outer-block></nested>success</outer></template>'
        );
    });

    it('should render nested partial blocks at different nesting levels (twice)', function () {
      expectTemplate('<template>{{#> outer}}{{value}}{{/outer}}</template>')
        .withInput({ value: 'success' })
        .withPartials({
          outer:
            '<outer>{{#> nested}}<outer-block>{{> @partial-block}} {{> @partial-block}}</outer-block>{{/nested}}{{> @partial-block}}+{{> @partial-block}}</outer>',
          nested: '<nested>{{> @partial-block}}</nested>',
        })
        .toCompileTo(
          '<template><outer><nested><outer-block>success success</outer-block></nested>success+success</outer></template>'
        );
    });

    it('should render nested partial blocks (twice at each level)', function () {
      expectTemplate('<template>{{#> outer}}{{value}}{{/outer}}</template>')
        .withInput({ value: 'success' })
        .withPartials({
          outer:
            '<outer>{{#> nested}}<outer-block>{{> @partial-block}} {{> @partial-block}}</outer-block>{{/nested}}</outer>',
          nested: '<nested>{{> @partial-block}}{{> @partial-block}}</nested>',
        })
        .toCompileTo(
          '<template><outer>' +
            '<nested><outer-block>success success</outer-block><outer-block>success success</outer-block></nested>' +
            '</outer></template>'
        );
    });
  });

  describe('inline partials', function () {
    it('should define inline partials for template', function () {
      expectTemplate(
        '{{#*inline "myPartial"}}success{{/inline}}{{> myPartial}}'
      ).toCompileTo('success');
    });

    it('should overwrite multiple partials in the same template', function () {
      expectTemplate(
        '{{#*inline "myPartial"}}fail{{/inline}}{{#*inline "myPartial"}}success{{/inline}}{{> myPartial}}'
      ).toCompileTo('success');
    });

    it('should define inline partials for block', function () {
      expectTemplate(
        '{{#with .}}{{#*inline "myPartial"}}success{{/inline}}{{> myPartial}}{{/with}}'
      ).toCompileTo('success');

      expectTemplate(
        '{{#with .}}{{#*inline "myPartial"}}success{{/inline}}{{/with}}{{> myPartial}}'
      ).toThrow(Error, /"myPartial" could not/);
    });

    it('should override global partials', function () {
      expectTemplate(
        '{{#*inline "myPartial"}}success{{/inline}}{{> myPartial}}'
      )
        .withPartials({
          myPartial: function () {
            return 'fail';
          },
        })
        .toCompileTo('success');
    });

    it('should override template partials', function () {
      expectTemplate(
        '{{#*inline "myPartial"}}fail{{/inline}}{{#with .}}{{#*inline "myPartial"}}success{{/inline}}{{> myPartial}}{{/with}}'
      ).toCompileTo('success');
    });

    it('should override partials down the entire stack', function () {
      expectTemplate(
        '{{#with .}}{{#*inline "myPartial"}}success{{/inline}}{{#with .}}{{#with .}}{{> myPartial}}{{/with}}{{/with}}{{/with}}'
      ).toCompileTo('success');
    });

    it('should define inline partials for partial call', function () {
      expectTemplate('{{#*inline "myPartial"}}success{{/inline}}{{> dude}}')
        .withPartials({ dude: '{{> myPartial }}' })
        .toCompileTo('success');
    });

    it('should define inline partials in partial block call', function () {
      expectTemplate(
        '{{#> dude}}{{#*inline "myPartial"}}success{{/inline}}{{/dude}}'
      )
        .withPartials({ dude: '{{> myPartial }}' })
        .toCompileTo('success');
    });

    it('should render nested inline partials', function () {
      expectTemplate(
        '{{#*inline "outer"}}{{#>inner}}<outer-block>{{>@partial-block}}</outer-block>{{/inner}}{{/inline}}' +
          '{{#*inline "inner"}}<inner>{{>@partial-block}}</inner>{{/inline}}' +
          '{{#>outer}}{{value}}{{/outer}}'
      )
        .withInput({ value: 'success' })
        .toCompileTo('<inner><outer-block>success</outer-block></inner>');
    });

    it('should render nested inline partials with partial-blocks on different nesting levels', function () {
      expectTemplate(
        '{{#*inline "outer"}}{{#>inner}}<outer-block>{{>@partial-block}}</outer-block>{{/inner}}{{>@partial-block}}{{/inline}}' +
          '{{#*inline "inner"}}<inner>{{>@partial-block}}</inner>{{/inline}}' +
          '{{#>outer}}{{value}}{{/outer}}'
      )
        .withInput({ value: 'success' })
        .toCompileTo(
          '<inner><outer-block>success</outer-block></inner>success'
        );
    });

    it('should render nested inline partials (twice at each level)', function () {
      expectTemplate(
        '{{#*inline "outer"}}{{#>inner}}<outer-block>{{>@partial-block}} {{>@partial-block}}</outer-block>{{/inner}}{{/inline}}' +
          '{{#*inline "inner"}}<inner>{{>@partial-block}}{{>@partial-block}}</inner>{{/inline}}' +
          '{{#>outer}}{{value}}{{/outer}}'
      )
        .withInput({ value: 'success' })
        .toCompileTo(
          '<inner><outer-block>success success</outer-block><outer-block>success success</outer-block></inner>'
        );
    });
  });

  it('should pass compiler flags', function () {
    if (Handlebars.compile) {
      var env = Handlebars.create();
      env.registerPartial('partial', '{{foo}}');
      var template = env.compile('{{foo}} {{> partial}}', { noEscape: true });
      expect(template({ foo: '<' })).toBe('< <');
    }
  });

  describe('standalone partials', function () {
    it('indented partials', function () {
      expectTemplate('Dudes:\n{{#dudes}}\n  {{>dude}}\n{{/dudes}}')
        .withInput({
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartial('dude', '{{name}}\n')
        .toCompileTo('Dudes:\n  Yehuda\n  Alan\n');
    });

    it('nested indented partials', function () {
      expectTemplate('Dudes:\n{{#dudes}}\n  {{>dude}}\n{{/dudes}}')
        .withInput({
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({
          dude: '{{name}}\n {{> url}}',
          url: '{{url}}!\n',
        })
        .toCompileTo(
          'Dudes:\n  Yehuda\n   http://yehuda!\n  Alan\n   http://alan!\n'
        );
    });

    it('prevent nested indented partials', function () {
      expectTemplate('Dudes:\n{{#dudes}}\n  {{>dude}}\n{{/dudes}}')
        .withInput({
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({
          dude: '{{name}}\n {{> url}}',
          url: '{{url}}!\n',
        })
        .withCompileOptions({ preventIndent: true })
        .toCompileTo(
          'Dudes:\n  Yehuda\n http://yehuda!\n  Alan\n http://alan!\n'
        );
    });
  });

  describe('compat mode', function () {
    it('partials can access parents', function () {
      expectTemplate('Dudes: {{#dudes}}{{> dude}}{{/dudes}}')
        .withInput({
          root: 'yes',
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({ dude: '{{name}} ({{url}}) {{root}} ' })
        .withCompileOptions({ compat: true })
        .toCompileTo(
          'Dudes: Yehuda (http://yehuda) yes Alan (http://alan) yes '
        );
    });

    it('partials can access parents with custom context', function () {
      expectTemplate('Dudes: {{#dudes}}{{> dude "test"}}{{/dudes}}')
        .withInput({
          root: 'yes',
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({ dude: '{{name}} ({{url}}) {{root}} ' })
        .withCompileOptions({ compat: true })
        .toCompileTo(
          'Dudes: Yehuda (http://yehuda) yes Alan (http://alan) yes '
        );
    });

    it('partials can access parents without data', function () {
      expectTemplate('Dudes: {{#dudes}}{{> dude}}{{/dudes}}')
        .withInput({
          root: 'yes',
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({ dude: '{{name}} ({{url}}) {{root}} ' })
        .withRuntimeOptions({ data: false })
        .withCompileOptions({ data: false, compat: true })
        .toCompileTo(
          'Dudes: Yehuda (http://yehuda) yes Alan (http://alan) yes '
        );
    });

    it('partials inherit compat', function () {
      expectTemplate('Dudes: {{> dude}}')
        .withInput({
          root: 'yes',
          dudes: [
            { name: 'Yehuda', url: 'http://yehuda' },
            { name: 'Alan', url: 'http://alan' },
          ],
        })
        .withPartials({
          dude: '{{#dudes}}{{name}} ({{url}}) {{root}} {{/dudes}}',
        })
        .withCompileOptions({ compat: true })
        .toCompileTo(
          'Dudes: Yehuda (http://yehuda) yes Alan (http://alan) yes '
        );
    });
  });

  describe('maxPartialDepth', function () {
    // chain(n) drives the single `rec` partial n+1 levels deep:
    // chain(0) -> 1 partial invocation, chain(k) -> k + 1 invocations,
    // producing k pairs of brackets.
    function chain(n) {
      let current = {};
      while (n--) {
        current = { deeper: current };
      }
      return current;
    }
    var recursivePartial = '{{#if deeper}}[{{> rec deeper}}]{{/if}}';

    function brackets(n) {
      return Array.from({ length: n + 1 }).join('[') +
        Array.from({ length: n + 1 }).join(']');
    }

    it('allows nesting exactly at the limit', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(2))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 3 })
        .toCompileTo('[[]]');
    });

    it('throws a Handlebars.Exception when nesting exceeds the limit', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(3))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 3 })
        .toThrow(
          Handlebars.Exception,
          /Partial nesting depth of 4 exceeded the maxPartialDepth of 3/
        );
    });

    it('lists the partial chain from outermost to innermost', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(3))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 3 })
        .toThrow(
          Handlebars.Exception,
          /Partial chain \(outermost to innermost\): rec > rec > rec > rec/
        );
    });

    it('abbreviates the middle of long chains but keeps head and tail', function () {
      var env = Handlebars.create();
      env.registerPartial('rec', recursivePartial);
      // chain(25) reaches depth 26, so the thrown chain has 26 entries
      var template = env.compile('{{> rec .}}', { maxPartialDepth: 25 });

      var message;
      try {
        template(chain(25));
      } catch (error) {
        message = error.message;
      }

      expect(message).toBeDefined();
      // first 10 and last 10 names stay, the 6 in the middle collapse
      expect(message).toMatch(/\.\.\.\(6 more\)\.\.\./);
      var visibleNames = message.split('Partial chain')[1];
      expect(visibleNames.indexOf('rec > rec > rec > rec > rec')).toBe(
        visibleNames.indexOf(':') + 2
      );
      expect(visibleNames).toMatch(/rec > rec > rec > rec > rec$/);
      expect((visibleNames.match(/\brec\b/g) || []).length).toBe(20);
    });

    it('counts dynamically chosen partials', function () {
      expectTemplate('{{> (which) .}}')
        .withInput(chain(2))
        .withHelper('which', function () {
          return 'rec';
        })
        .withPartials({ rec: '{{#if deeper}}[{{> (which) deeper}}]{{/if}}' })
        .withCompileOptions({ maxPartialDepth: 2 })
        .toThrow(
          Handlebars.Exception,
          /depth of 3[\s\S]*Partial chain \(outermost to innermost\): rec > rec > rec/
        );
    });

    it('counts block partials', function () {
      expectTemplate('{{#> rec .}}content{{/rec}}')
        .withInput(chain(2))
        .withPartials({
          rec: '{{#if deeper}}[{{#> rec deeper}}x{{/rec}}]{{/if}}',
        })
        .withCompileOptions({ maxPartialDepth: 2 })
        .toThrow(
          Handlebars.Exception,
          /depth of 3[\s\S]*Partial chain \(outermost to innermost\): rec > rec > rec/
        );
    });

    it('counts inline partials', function () {
      expectTemplate(
        '{{#* inline "rec"}}{{#if deeper}}[{{> rec deeper}}]{{/if}}{{/inline}}{{> rec .}}'
      )
        .withInput(chain(2))
        .withCompileOptions({ maxPartialDepth: 2 })
        .toThrow(
          Handlebars.Exception,
          /depth of 3[\s\S]*Partial chain \(outermost to innermost\): rec > rec > rec/
        );
    });

    it('reports the chain through mutually recursive partials', function () {
      expectTemplate('{{> a .}}')
        .withInput(chain(4))
        .withPartials({
          a: '{{#if deeper}}a[{{> b deeper}}]{{/if}}',
          b: '{{#if deeper}}b[{{> a deeper}}]{{/if}}',
        })
        .withCompileOptions({ maxPartialDepth: 4 })
        .toThrow(
          Handlebars.Exception,
          /Partial chain \(outermost to innermost\): a > b > a > b > a/
        );
    });

    it('does not count each/with block helpers as depth', function () {
      expectTemplate(
        '{{#with root}}{{#each items}}{{> leaf .}}{{/each}}{{/with}}'
      )
        .withInput({ root: { items: [1, 2, 3] } })
        .withPartials({ leaf: '{{.}}' })
        .withCompileOptions({ maxPartialDepth: 1 })
        .toCompileTo('123');
    });

    it('does not accumulate depth across sibling partials', function () {
      expectTemplate('{{#each items}}{{> leaf .}}{{/each}}')
        .withInput({
          items: Array.from({ length: 100 }, function (_, i) {
            return i;
          }),
        })
        .withPartials({ leaf: '{{.}}.' })
        .withCompileOptions({ maxPartialDepth: 1 })
        .toCompileTo(
          Array.from({ length: 100 }, function (_, i) {
            return i + '.';
          }).join('')
        );
    });

    it('keeps renders independent from each other', function () {
      var env = Handlebars.create();
      env.registerPartial('rec', recursivePartial);
      var template = env.compile('{{> rec .}}', { maxPartialDepth: 2 });

      expect(function () {
        template(chain(5));
      }).toThrow();
      // A later, shallow render of the same template must still work: the
      // chain from the failed render must not leak into subsequent renders.
      expect(template(chain(1))).toBe('[]');
      expect(function () {
        template(chain(2));
      }).toThrow(Handlebars.Exception);
    });

    it('lets runtime options lower the compile-time limit', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(3))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 100 })
        .withRuntimeOptions({ maxPartialDepth: 3 })
        .toThrow(
          Handlebars.Exception,
          /Partial nesting depth of 4 exceeded the maxPartialDepth of 3/
        );
    });

    it('lets runtime options raise the compile-time limit', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(3))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 2 })
        .withRuntimeOptions({ maxPartialDepth: 4 })
        .toCompileTo('[[[]]]');
    });

    it('disables the limit at runtime with maxPartialDepth 0', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(20))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 2 })
        .withRuntimeOptions({ maxPartialDepth: 0 })
        .toCompileTo(brackets(20));
    });

    it('disables the limit at compile time with maxPartialDepth 0', function () {
      expectTemplate('{{> rec .}}')
        .withInput(chain(20))
        .withPartials({ rec: recursivePartial })
        .withCompileOptions({ maxPartialDepth: 0 })
        .toCompileTo(brackets(20));
    });

    it('rejects invalid compile-time values', function () {
      expect(function () {
        Handlebars.compile('x', { maxPartialDepth: -1 });
      }).toThrow(Handlebars.Exception, /maxPartialDepth/);

      expect(function () {
        Handlebars.compile('x', { maxPartialDepth: 1.5 });
      }).toThrow(Handlebars.Exception, /maxPartialDepth/);

      expect(function () {
        Handlebars.compile('x', { maxPartialDepth: 'lots' });
      }).toThrow(Handlebars.Exception, /maxPartialDepth/);
    });

    it('rejects invalid runtime values', function () {
      var template = Handlebars.compile('x');
      expect(function () {
        template({}, { maxPartialDepth: -2 });
      }).toThrow(Handlebars.Exception, /maxPartialDepth/);
      expect(function () {
        template({}, { maxPartialDepth: true });
      }).toThrow(Handlebars.Exception, /maxPartialDepth/);
    });

    it('protects precompiled templates via the baked-in compile option', function () {
      var env = Handlebars.create();
      var spec = env.precompile('{{> rec .}}', { maxPartialDepth: 2 });
      /* eslint-disable no-eval */
      var template = env.template(eval('(' + spec + ')'));
      /* eslint-enable no-eval */
      env.registerPartial('rec', recursivePartial);

      expect(template(chain(1))).toBe('[]');
      expect(function () {
        template(chain(2));
      }).toThrow(
        Handlebars.Exception,
        /Partial nesting depth of 3 exceeded the maxPartialDepth of 2/
      );
    });

    it('allows runtime options to override precompiled templates', function () {
      var env = Handlebars.create();
      var spec = env.precompile('{{> rec .}}');
      /* eslint-disable no-eval */
      var template = env.template(eval('(' + spec + ')'));
      /* eslint-enable no-eval */
      env.registerPartial('rec', recursivePartial);

      expect(function () {
        template(chain(2), { maxPartialDepth: 2 });
      }).toThrow(
        Handlebars.Exception,
        /Partial nesting depth of 3 exceeded the maxPartialDepth of 2/
      );
    });

    it('prevents cyclic data from overflowing the JS stack by default', function () {
      var env = Handlebars.create();
      var a = { replies: [] };
      var b = { replies: [a] };
      a.replies.push(b);
      env.registerPartial(
        'comment',
        '{{#each replies}}{{> comment .}}{{/each}}'
      );
      var template = env.compile('{{> comment .}}');

      expect(function () {
        template(a);
      }).toThrow(
        Handlebars.Exception,
        /exceeded the maxPartialDepth of 200[\s\S]*comment > comment/
      );
    });
  });
});
