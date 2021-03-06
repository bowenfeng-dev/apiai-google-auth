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

const REMINDER_INTERVAL_IN_MS = 25 * 60 * 1000

admin.initializeApp(config.firebase);

exports.minutelyJob = functions.pubsub.topic('minutely-tick').onPublish(event => {
  console.log("This job is ran every minute!");
  console.log(event);
  
  let db = admin.database();
  db.ref(`/schedules`).once('value').then(schedules => {
    console.log('Loop through all scheduled sessions');
    const now = Date.now();
    schedules.forEach(session => {
      const uid = session.key;
      const started = session.val();
      const elapsed = now - started;
      console.log(`Session: uid=${uid}, time=${started}, elapsed=${elapsed / 1000}s (${elapsed/60000.0}m)`);

      if (elapsed >= REMINDER_INTERVAL_IN_MS) {
        let lastViewed = db.ref(`/users/${uid}/session/lastViewed`);
        lastViewed.once('value').then(snapshot => {
          if (snapshot.val() == 0) {
            sendNotification(uid);
            db.ref(`/users/${uid}/session/lastViewed`).set(now);
          }
        });
      }
    });
  });
});

function sendNotification(uid) {
  console.log(`Need to send notification`);
  getTokenByUid(uid).then(fcmToken => {
    console.log(`FCM token for user ${uid} is ${fcmToken}`);
    let payload = {
      notification: {
        title: `Now it's your exercise time.`,
        body: `Stop working and relex your muscle by doing one simple exercise.`
      },
      data: {
        exerciseId: new Date().toTimeString(), // TODO: Choose an actual exercise ID.
      },
    }
    admin.messaging().sendToDevice(fcmToken, payload).then(() => {
      console.log(`Notification was sent`);
    });
  });
}


exports.apiAiHandler = functions.https.onRequest((request, response) => {
  const app = new App({request, response});

  console.log(`apiAiHandler starts -------------------`);
  console.log(request);
  console.log(app);

  function responseHandler (app) {
    let token = app.getUser().accessToken;

    if (!token) {
      console.log('User access token is unavailable.');
      app.tell('Token is unavailable');
    }

    findFirebaseUser(token).then(user => {
      console.log('Found user for email ' + user.email);
      console.log(user);
      getToken(user)
          .then(token => {
            console.log(`token ${token}`);
            let payload = {
              notification: {
                title: `Hello ${user.displayName}`,
                body: `Your email: ${user.email}`
              },
              data: {
                score: '850',
                time: '2:45',
                test: 'test'
              },
              
            };
            admin.messaging()
                .sendToDevice(token, payload)
                .then(res => {
                  app.tell(`Hello ${user.displayName}`);
                });
          });

    }).catch(e => {
      console.log(e);
      app.tell(`Couldn't find registered user for you.`);
    });
  }
  
  function startSessionHandler(app) {
    const sessionType = request.body.result.parameters['SessionType'];
    console.log(`New session with type ${sessionType}`);

    let accessToken = app.getUser().accessToken;
    if (!accessToken) {
      console.log('User access token is unavailable.');
      app.tell('Access token is unavailable');
    }

    findFirebaseUser(accessToken).then(user => {
      console.log(`Found user for email ${user.email} uid=${user.uid}`);
      const uid = user.uid;
      const now = Date.now();
      let db = admin.database();
      Promise.all([
        db.ref(`/users/${uid}/session`).set({
          timestamp: now,
          type: sessionType,
          lastViewed: 0
        }),
        db.ref(`/schedules/${uid}`).set(now)
      ]).then(results => {
        console.log('Successfully updated the database');
        console.log(results);
        app.tell(`Now I know that you are ${sessionType}. I'll reminde you to do some workout every 25 minutes.`);
      }).catch(error => {
        console.log('Something went wrong.');
        console.log(error);
        app.tell(`Something went wrong, I couldn't start the session.`);
      });
    });
  }

  const actionMap = new Map();
  actionMap.set('input.welcome', responseHandler);
  actionMap.set('startSession', startSessionHandler);
  console.log(actionMap);
  
  console.log('start handling request');

  app.handleRequest(actionMap);
});

function getToken(user) {
  return getTokenByUid(user.uid);
}

function getTokenByUid(uid) {
  return admin.database().ref(`/users/${uid}/settings`)
      .once('value')
      .then(snapshot => {
        console.log(snapshot.val());
        return snapshot.child('token').val();
      });
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
