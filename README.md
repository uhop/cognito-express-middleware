# `cognito-express-middleware` [![NPM version][npm-img]][npm-url]

[npm-img]: https://img.shields.io/npm/v/cognito-express-middleware.svg
[npm-url]: https://npmjs.org/package/cognito-express-middleware

The [Express](https://expressjs.com/) middleware to authenticate and authorized users using [AWS Cognito](https://aws.amazon.com/cognito/)
[user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html).
It validates a JWT token (either an id or access token) and populates `req.user`, or any other property of your choice,
with its deciphered content. Simple helpers are provided to make decisions on accessibility of API endpoints for a given user.

This project is based on [cognito-toolkit](https://www.npmjs.com/package/cognito-toolkit). It is a sister project of [koa-cognito-middleware](https://www.npmjs.com/package/koa-cognito-middleware).

# Examples

```js
const express = require('express');
const getUser = require('cognito-express-middleware');

const {isAuthenticated, hasScope, hasGroup, isAllowed} = getUser;

const app = express();

// run getUser() on every request
app.use(getUser({
  region: 'us-east-1',
  userPoolId: 'us-east-1_MY_USER_POOL'
}));

// populate router1 with custom authorization rules

const router1 = express.Router();

router1.get('/a',
  (_, res) => res.send('all allowed'));

router1.get('/b', isAuthenticated,
  (_, res) => res.send('all authenticated'));

router1.post('/c', hasGroup('user-type/writers'),
  (_, res) => res.send('only a writers group'));

router1.post('/d', hasScope('writers'),
  (_, res) => res.send('only with a writers scope'));

router1.post('/user',
  (req, res) => res.json(req.user || {}));

app.use('/', router1);

// protect all routes with a single validator

const router2 = new Router();
// populate router2

const readMethods = {GET: 1, HEAD: 1, OPTIONS: 1};

const validator = async (req, groups, scopes) => {
  if (readMethods[req.method.toUpperCase()] === 1) return true;
  // only writers can use other methods (POST, PUT, PATCH, DELETE...)
  if (groups.some(g => g === 'user-type/writers')) return true;
  if (scopes.some(s => s === 'user-type/writers')) return true;
  return false;
};

app
  .use(isAllowed(validator))
  .get('/lift', (req, res) => {
    const user = req.user;
    if (user) {
      user.setAuthCookie(req, res, {domain: 'api.my-domain.com'});
    }
    res.sendStatus(204);
  })
  .use('/', router2);

// now all routes of router2 are protected by our validator
```

# How to install

```txt
npm install --save cognito-express-middleware
# yarn add cognito-express-middleware
```

# Documentation

All provided functions are explained below. See the examples above for usage patterns.

## `getUser(options [, pools])`

This is the main function directly returned from the module. It populates `req[getUser.stateUserProperty]` (see below)
with a decoded JWT or assigns it to `null` (cannot positively authenticate).
Other helpers or a user's code uses it to authorize or reject the user for a given route.

Additionally if an authenticated user it adds the following properties:

* `_token` &mdash; the original JWT.
* `setAuthCookie(req, res, options)` &mdash; a function, which when called sets a cookie specified by `authCookie` (see below) to `_token`.
  The optional `options` argument is an object compatible with [options for res.cookie()](https://expressjs.com/en/5x/api.html#res.cookie).
  By default the cookie is set with following options:
    * `expires` &mdash; an expiration time of a JWT.
    * `domain` &mdash; a value of `req.host`.
  `options` will overwrite/augment those values.

`getUser(options [, pools])` takes `options`, which is an object with the following properties:

* `region` &mdash; **required** string, which specifies an AWS region, such as `'us-east-1'`. Default: **none**.
* `userPoolId` &mdash; **required** string, which specifies a user pool ID, such as `'us-east-1_MY_USER_POOL'`. Default: **none**.
* `authHeader` &mdash; optional string. Default: `'Authorization'`. It specifies an HTTP request header name. Its value should be a JWT supplied by AWS Cognito (`id_token` or `access_token`).
* `authCookie` &mdash; optional string. Default: `'auth'`. It specifies an HTTP request cookie name. Its value should be a JWT supplied by AWS Cognito (`id_token` or `access_token`).
* `source` &mdash; optional function. Default: reads `authHeader` header and returns it, if it is not falsy, otherwise reads `authCookie` cookie and returns it, if it is not false, otherwise returns `null`.
  If it is a function, it is called with `req` argument, and can inspect a request to produce a JWT token as a string.
    * Examples:
      ```js
      const getToken1 = req => req.get('x-auth-header');
      const getToken2 = req => req.cookies['auth-token'];
      ```
* `setAuthCookieOptions` &mdash; optional object compatible with [options for res.cookie()](https://expressjs.com/en/5x/api.html#res.cookie).
  If it is `null` (the default), a cookie is not set automatically. Otherwise, it is set every time it is not set or has a different value. When a cookie is set,
  `setAuthCookieOptions` is used to overwrite/augment the default options described above in `setAuthCookie()`.

Optional `pools`, if specified, should be an object with the following properties or an array of such objects:

* `region` &mdash; **required** string, which specifies an AWS region, such as `'us-east-1'`. Default: **none**.
* `userPoolId` &mdash; **required** string, which specifies a user pool ID, such as `'us-east-1_MY_USER_POOL'`. Default: **none**.

If `pools` is specified `region` and `userPoolId` of `options` are ignored. Specifying `pools` is the only way to supply an array of user pools.

This function should be used before any other helpers.

## `getUser.stateUserProperty`

This is a property name to hold a user object. It can be a string or a `Symbol`. Default: `'user'`.

Usually it is assigned right after obtaining `getUser()`:

```js
const getUser = require('cognito-express-middleware');
getUser.stateUserProperty = 'cognitoUser';
const {isAuthenticated, hasScope, hasGroup, isAllowed} = getUser;
```

All other helper functions will use this value to inspect the state's user property.

## `getUser.isAuthenticated`

This is a helper function, which checks if the state's user property is set. If not it rejects a request with 401 (unauthorized).

## `getUser.hasGroup(group)`

This is a helper function, which checks if the state's user property has `'cognito:groups'` array that includes a given group (as a string).
If not it rejects a request with 403 (forbidden) for valid users and 401 (unauthorized) for non-authenticated users.

## `getUser.hasScope(scope)`

This is a helper function, which checks if the state's user property has `'scope'` string that includes a given scope (as a string).
If not it rejects a request with 403 (forbidden) for valid users and 401 (unauthorized) for non-authenticated users.

## `getUser.isAllowed(validator)`

This is a helper function, which checks runs a validator. If not it rejects a request with 403 (forbidden) for valid users and 401 (unauthorized) for non-authenticated users.

`validator` is an asynchronous function, which is called with three parameters: the original `req`, `groups` and `scopes`.
The latter two parameters are arrays of strings listing `cognito:groups` and `scope` items respectively.
`validator` should return a truthy value, if a user is allowed to perform an action, and a falsy value otherwise.

# Versions

- 1.4.8 *Updated README.*
- 1.4.7 *The initial public release.*

# License

[The 3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause)
