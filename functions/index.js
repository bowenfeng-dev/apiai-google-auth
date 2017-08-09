'use strict';

process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').ApiAiApp;
const functions = require('firebase-functions');
const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const oauth2Api = google.oauth2('v2');
const admin = require('firebase-admin');

const config = functions.config();

const CLIENT_ID = config.myoauth.cid;
const CLIENT_SECRET = config.myoauth.cs;
const REDIRECT_URL = config.myoauth.rurl;

admin.initializeApp(config.firebase);

exports.yourAction = functions.https.onRequest((request, response) => {
  const app = new App({request, response});

  function responseHandler (app) {
    let token = app.getUser().accessToken;

    if (!token) {
      console.log('User access token is unavailable.');
      app.tell('Token is unavailable');
    }

    findFirebaseUser(token).then(user => {
      console.log('Found user for email ' + user.email);
      console.log(user);
      console.log('Getting user songs.')
      readUserData(user).then(snapshot => {
        console.log('Here is the user songs snapshot')
        console.log('snapshot: ');
        console.log(snapshot);
        console.log('snapshot.key: ' + snapshot.key);
        console.log('snapshot.val(): ' + snapshot.val());
        snapshot.forEach(song => {
          console.log('Processing one song: ');
          console.log(song);
          console.log('song.val(): ' + song.val());  // song content object
          console.log('song.key: ' + song.key); // key of the song
          console.log('song.val().title: ' + song.val().title);  // title of the song
          song.ref.update({title: song.val().title + 'x'});
        })
        app.tell('Hello ' + user.displayName);
      })
    }).catch(e => {
      console.log(e);
      app.tell(`Couldn't find registered user for you.`);
    });
  }

  const actionMap = new Map();
  actionMap.set('input.welcome', responseHandler);

  app.handleRequest(actionMap);
});

function readUserData(user) {
  const uid = user.uid;
  return admin.database().ref(`/users/${uid}/songs`)
      .once('value');
}

function findFirebaseUser(token) {
  return findUserEmail(token).then(email => {
    return admin.auth().getUserByEmail(email);
  }).catch(e => {
    return Promise.reject(e);
  });
}

function findUserEmail(token) {
  const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
  oauth2Client.setCredentials({ access_token: token });
  return new Promise((resolve, reject) => {
    oauth2Api.userinfo.get({auth: oauth2Client}, (e, info) => {
      console.log('Oauth get userinfo response');
      console.log(info);
      if (!!e) {
        console.log('Oauth with token failed');
        console.log(e);
        reject(e);
      } else {
        console.log('Got user email: ' + info.email);
        resolve(info.email);
      }
    });
  });
}
