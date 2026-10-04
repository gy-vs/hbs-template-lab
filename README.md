# handlebars

Run tests: `npx vitest run --project node`

## maxPartialDepth

Partials that recursively include themselves (directly, through another
partial, or via cyclic data) used to overflow the JavaScript stack with an
uninformative `Maximum call stack size exceeded`. Handlebars now caps the
nesting depth of partial calls within a single render.

- The option is named `maxPartialDepth` and accepts a non-negative integer.
  It can be passed to `Handlebars.compile`/`Handlebars.precompile` (the value
  is baked into precompiled templates) and overridden per render by passing
  the same option to the template function.
- The default is `200`. Comment trees within 100 levels deep are never
  affected; the guard also fires comfortably before the JS stack overflows.
- `0` disables the limit. Invalid values (negative, non-integer,
  non-numeric) throw a `Handlebars.Exception` at the point they are used.
- When the limit is exceeded, a `Handlebars.Exception` is thrown. Its message
  states the reached depth and lists the chain of partial names from the
  outermost to the innermost invocation (`comment > comment > comment …`);
  long chains keep the first and last ten names and collapse the middle.
- Only entering a partial counts; `each`, `with` and other block helpers do
  not. Flat lists of sibling partials are not limited, and counting is
  independent per render.

```js
const template = Handlebars.compile(source, { maxPartialDepth: 100 });
template(context); // uses 100
template(context, { maxPartialDepth: 50 }); // this render uses 50
```
