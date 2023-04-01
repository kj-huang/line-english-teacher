require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const { LineClient } = require('messaging-api-line');
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const {spawn} = require('child_process');


const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

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
    await client.retrieveMessageContent(events[0].message.id).then(async (buffer) => {
      console.log(buffer);
      const buff = Buffer.from(buffer, 'base64');
      fs.writeFileSync('test.aac', buff);
      await transcribe('test.aac');
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

async function transcribe(filename) {
  const openai = new OpenAIApi(configuration);
  const inputFile = fs.createReadStream(filename);
  const outputPath = filename.replace('.aac','.mp3');
  const outputStream = fs.createWriteStream(outputPath);
  const convertion = spawn("ffmpeg", ["-i","pipe:0","-f","mp3","pipe:1",]);
  inputFile.pipe(convertion.stdin);
  convertion.stdout.pipe(outputStream);

  convertion.on('close', async (code) => {
    let y = fs.createReadStream('./test.mp3')
    const result = await openai.createTranscription(y, 'whisper-1');

    let improvement = await chatCorrector(result.data.text);
    let beautify = `origin: ${result.data.text} \n\n improvement: ${improvement}`;
    await client.pushText(process.env.MY_ACCOUNT, beautify);
  });
}


async function chatCorrector (input){
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: "I want you to act as an English teacher, spelling corrector and improver. Answer the corrected and improved version of my text, in English. I want you to replace my simplified A0-level words and sentences with more beautiful and elegant, upper level English words and sentences. Keep the meaning same, but make them more literary. I want you to only reply the correction, the improvements and nothing else, do not write explanations, the text is: \n\n" + input 
  });
  
  return completion.data.choices[0].text;
}

module.exports = app;