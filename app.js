require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const {spawn} = require('child_process');
const gtts = require('node-gtts')('en');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const { LineClient } = require('messaging-api-line');

// get accessToken and channelSecret from LINE developers website
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
  res.send('Hello World');
})

app.get('/health-check', async function(req, res) {
  res.send('OK');
})

//POST webhook callback
app.post('/webhook', async function(req, res) {
  const {events} = req.body;

  // console.log(req.body.events);

  if(events && events.length > 0){
    await client.retrieveMessageContent(events[0].message.id).then(async(buffer) => {
      const buff = Buffer.from(buffer, 'base64');
      fs.writeFileSync('test.aac', buff);
      await transcribe('test.aac');
    });
  }

  res.sendStatus(200);
})

app.get('/return.wav', function(req, res) {
  console.log(__dirname)
  res.sendFile(path.join(__dirname, 'return.wav'));
})

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
    console.log(result.data.text)
    let improvement = await chatCorrector(result.data.text);
    let beautify = `Origin: ${result.data.text} \n\nImprovement: ${improvement}`;
    await client.pushText(process.env.MY_ACCOUNT, beautify);
    await sendVoiceMessage(improvement);
  });
}

async function chatCorrector (input){
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    temperature: 0.8,
    // prompt: "I want you to act as an English teacher, spelling corrector and improver. Answer the corrected and improved version of my text, in English. I want you to replace my simplified A0-level words and sentences with more beautiful and elegant, upper level English words and sentences. Keep the meaning same, but make them more literary. I want you to only reply the correction, the improvements and nothing else, do not write explanations, the text is: \n\n" + input 
    prompt: "Correct this to standard English:\n\n" + input,
  });
  
  console.log(completion.data.choices);
  return completion.data.choices[0].text.trim();
}

async function sendVoiceMessage(text) {
  const filepath = path.join(__dirname, 'return.wav');
  gtts.save(filepath, text, async function() {
    console.log('save done');

    await client.pushAudio(process.env.MY_ACCOUNT, {
      originalContentUrl: process.env.WEB_HOST + '/return.wav',
      duration: 5000,
    });
  })
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
});

module.exports = app;