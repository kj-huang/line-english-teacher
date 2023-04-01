require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const { LineClient } = require('messaging-api-line');

const client = new LineClient({
  accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.use(session({
    secret: '123',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 86400000*30
    }
}));

app.use(logger('dev'));
app.use(express.json({limit: '30mb'}));
app.use(express.urlencoded({ extended: true ,limit: '30mb'}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.get('/', async function(req, res) {
  await client.pushText(process.env.MY_ACCOUNT, 'test message');
  res.send('success');
})

app.post('/webhook', async function(req, res) {
  const { body } = req;
  const { events } = body;

  if(events && events.length > 0){
    await client.retrieveMessageContent(events[0].message.id).then((buffer) => {
      console.log(buffer);
    })
  }

  return res.send('success');
})

app.get('/smoke-test', async function(req, res) {
  try {
    await client.pushText(process.env.MY_ACCOUNT, 'test message');
    res.send('success');
  } catch (err) {
    res.send(err);
  }
})

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send('error');
});

module.exports = app;