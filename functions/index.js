// Copyright 2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').ApiAiApp;
const functions = require('firebase-functions');
const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const oauth2Api = google.oauth2('v2');

const config = functions.config();

const CLIENT_ID = config.myoauth.cid;
const CLIENT_SECRET = config.myoauth.cs;
const REDIRECT_URL = config.myoauth.rurl;

exports.yourAction = functions.https.onRequest((request, response) => {
  const app = new App({request, response});

  function responseHandler (app) {
    let token = app.getUser().accessToken;
    if (!!token) {
      console.log('User access toke: ' + token);

      const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
      oauth2Client.setCredentials({
        access_token: token
      });
      oauth2Api.userinfo.get({auth: oauth2Client}, (e, info) => {
        console.log(e);
        console.log(info);
        app.tell('hello ' + info.name);
      });
    } else {
      app.tell('Token is unavailable');
    }
  }

  const actionMap = new Map();
  actionMap.set('input.welcome', responseHandler);

  app.handleRequest(actionMap);
});
