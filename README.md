# handlebars

Run tests: `npx vitest run --project node`

## maxPartialDepth

`maxPartialDepth` limits how deeply partials may nest within a single render.
It prevents cyclic data (e.g. a comment whose `replies` contain the comment
itself) from crashing the process with a `Maximum call stack size exceeded`.

```js
Handlebars.compile(templateString, { maxPartialDepth: 100 });
template(context, { maxPartialDepth: 50 }); // runtime option overrides compile
```

Only entering a partial counts as a level; `each`, `with` and other block
helpers do not, and flat lists of partials (one per comment, thousands of
them per page) are unaffected. Each render keeps its own independent counter.

When the limit is exceeded a `Handlebars.Exception` is thrown whose message
states the limit, the reached depth and the chain of partial names from the
outermost partial to the one that overflowed
(`comment -> comment -> ... -> comment`); long chains are collapsed in the
middle while keeping the beginning and the end.

The default limit is `200`, which comfortably covers trees up to 100 levels
deep. It applies to templates compiled or precompiled with this version; a
precompiled template keeps the value it was built with until a runtime option
overrides it. `0` and any other invalid value (negative, non-integer,
`Infinity`, non-number) are ignored and the default of `200` is used.
