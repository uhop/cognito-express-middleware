'use strict';

const makeGetUser = require('cognito-toolkit');

const getTokenFromHeader = (header, cookie) => {
  if (!header) return req => req.cookies?.[cookie] || null;
  header = header.toLowerCase();
  if (!cookie) return req => req.get(header) || null;
  return req => req.get(header) || req.cookies?.[cookie] || null;
};

const getUser = (options, pools) => {
  const opt = {authHeader: 'Authorization', authCookie: 'auth', region: '', userPoolId: '', setAuthCookieOptions: null, ...options};
  if (typeof opt.source != 'function') {
    opt.source = getTokenFromHeader(opt.authHeader, opt.authCookie);
  }
  const getRawUser = makeGetUser(pools || opt);
  const setAuthCookie = (req, res, cookieOptions) => {
    if (req[getUser.stateUserProperty] && opt.authCookie && req.cookies?.[opt.authCookie] !== req[getUser.stateUserProperty]._token) {
      res.cookie(opt.authCookie, req[getUser.stateUserProperty]._token, {
        expires: new Date(req[getUser.stateUserProperty].exp * 1000),
        domain: req.host,
        ...cookieOptions
      });
    }
  };
  return async (req, res, next) => {
    const token = opt.source(req);
    const user = await getRawUser(token);
    if (user) {
      user._token = token;
      user.setAuthCookie = setAuthCookie;
    }
    req[getUser.stateUserProperty] = user;

    const oldWriteHead = res.writeHead;
    if (typeof oldWriteHead == 'function') {
      res.writeHead = function (...args) {
        if (opt.setAuthCookieOptions && user) user.setAuthCookie(req, res, opt.setAuthCookieOptions);
        return oldWriteHead.apply(this, args);
      };
    }

    next();
  };
};

const isAuthenticated = (req, res, next) => {
  if (req[getUser.stateUserProperty]) return next();
  res.sendStatus(401);
};

const hasGroup = group => (req, res, next) => {
  if (req[getUser.stateUserProperty]) {
    const groups = req[getUser.stateUserProperty]['cognito:groups'];
    if (groups && groups instanceof Array && groups.some(g => g === group)) return next();
    res.sendStatus(403);
    return;
  }
  res.sendStatus(401);
};

const hasScope = scope => (req, res, next) => {
  if (req[getUser.stateUserProperty]) {
    const scopes = req[getUser.stateUserProperty].scope;
    if (scopes && typeof scopes == 'string' && scopes.split(' ').some(s => s === scope)) return next();
    res.sendStatus(403);
    return;
  }
  res.sendStatus(401);
};

const isAllowed = validator => async (req, res, next) => {
  const scopes = (req[getUser.stateUserProperty] && req[getUser.stateUserProperty].scope && req[getUser.stateUserProperty].scope.split(' ')) || [],
    groups = (req[getUser.stateUserProperty] && req[getUser.stateUserProperty]['cognito:groups']) || [];
  const pass = await validator(req, groups, scopes);
  if (pass) return next();
  res.sendStatus(req[getUser.stateUserProperty] ? 403 : 401);
};

getUser.stateUserProperty = 'user';
getUser.isAuthenticated = isAuthenticated;
getUser.hasGroup = hasGroup;
getUser.hasScope = hasScope;
getUser.isAllowed = isAllowed;

module.exports = getUser;
