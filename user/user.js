/***Communication with the microphone***/
const constants = require('./constants');

var net = require('net');
var serverSocket = require('socket.io-client')('http://127.0.0.1:3000');
var stream = require('stream');
var ss = require('socket.io-stream');
var fs = require('fs');

var opus = require('node-opus');
var ogg = require('ogg');
var Sox = require('sux');

var uuid = require('uuid');

var musicPlayer = require('./player');

var userIdentity = require('./identity.json');
var userPreference = require('./preference.json');
musicPlayer.setUserIdentity(userIdentity);

var stdin = process.openStdin();
stdin.on("data", function (buffer) {
    var input = buffer.toString().trim();
    var firstSpaceIndex = input.indexOf(' ');
    if (firstSpaceIndex > -1) {
        var subString = input.substr(firstSpaceIndex);
        input = input.substr(0, firstSpaceIndex);
    }
    switch (input) {
        case 'play':
            musicPlayer.play();
            break;
        case 'pause':
            musicPlayer.pause();
            break;
        case 'toggle':
            musicPlayer.playPauseToggle();
            break;
        case 'next':
            musicPlayer.next();
            break;
        case 'search':
            musicPlayer.searchAndPlay({
                text: subString
            });
            break;
    }
});

var microphoneServer = net.createServer(function (microphoneSocket) {
    microphoneSocket.id = uuid.v4();
    console.log('CONNECTED: ' + microphoneSocket.remoteAddress + ':' + microphoneSocket.remotePort + ' [' + microphoneSocket.id + ']');
    var encodedStream, encodedStreamWritable = false, encodedStreamEmitting = false;
    var sox, rawInputStream, opusEncoder, oggEncoder;
    var pendingAudioStreamBytes = 0;
    var microphoneStreamOpen = false;

    microphoneSocket.initRecording = function (data) {
        if (microphoneStreamOpen) {
            serverSocket.emit('user-error');
        }
        musicPlayer.waitForMicrophone();
        rawInputStream = new stream.PassThrough;
        opusEncoder = new opus.Encoder(constants.AUDIO_OUTPUT_SAMPLE_RATE, constants.AUDIO_OUTPUT_CHANNELS, constants.OPUS_FRAME_SIZE);
        oggEncoder = new ogg.Encoder();
        encodedStream = new ss.createStream();
        sox = new Sox({
            output: opusEncoder,
            depth: constants.AUDIO_OUTPUT_BITS,
            int: constants.AUDIO_OUTPUT_ENCODING,
            rate: constants.AUDIO_OUTPUT_SAMPLE_RATE,
            channels: constants.AUDIO_OUTPUT_CHANNELS,
            type: constants.AUDIO_OUTPUT_FILE_TYPE,
            input: {
                source: rawInputStream,
                depth: constants.AUDIO_INPUT_BITS,
                int: constants.AUDIO_INPUT_ENCODING,
                rate: constants.AUDIO_INPUT_SAMPLE_RATE,
                channels: constants.AUDIO_INPUT_CHANNELS,
                type: constants.AUDIO_INPUT_FILE_TYPE
            }
        });
        sox.start();
        rawInputStream.writeBuffer = function (buffer) {
            if (!encodedStreamEmitting) { // Emit to the server only when we have some audio stream data with us
                ss(serverSocket).emit('audio-stream', encodedStream, {
                    userIdentity: userIdentity,
                    userPreference: userPreference,
                    requestId: microphoneSocket.id
                });
                encodedStreamEmitting = true;
            }
            rawInputStream.write(buffer);
            pendingAudioStreamBytes -= buffer.length;
        };
        rawInputStream.endBuffer = function () {
            if (encodedStreamWritable) {
                rawInputStream.end();
                encodedStreamEmitting = false;
                encodedStreamWritable = false;
            }
        };
        opusEncoder.pipe(oggEncoder.stream());
        oggEncoder.pipe(encodedStream);

        encodedStreamWritable = true;
        microphoneStreamOpen = true;
    };

    microphoneSocket.endRecording = function (data) {
        rawInputStream.endBuffer();
        microphoneStreamOpen = false;
        musicPlayer.clearMicrophoneWait();
    };

    microphoneSocket.onRecordingError = function (err) {
        console.error(err);
        console.log("Sending reset to server");
        serverSocket.emit('user-error');
        console.log("Resuming music playback");
        musicPlayer.play();
    };

    microphoneSocket.writeControlValue = function (controlValue, callback) {
        var buf = new Buffer(2);
        buf.writeUInt16BE(controlValue);
        this.write(buf.toString('ascii'), callback);
    };

    microphoneSocket.on('data', function (buffer) {
        console.log(buffer);
        console.log("Buffer length : " + (buffer.length - 4));
        if (!encodedStreamWritable) {
            microphoneSocket.initRecording();
        }
        if (encodedStreamWritable) {
            if (pendingAudioStreamBytes <= 0) {
                if (buffer.length >= constants.streamHeader.STREAM_IDENTIFIER_POS + 2) {
                    console.log("Stream identifier : " + buffer.readUInt16BE(constants.streamHeader.STREAM_IDENTIFIER_POS));
                    switch (buffer.readUInt16BE(constants.streamHeader.STREAM_IDENTIFIER_POS)) {
                        case constants.streamHeader.streamIdentifiers.AUDIO:
                            console.log("Audio stream bytes : " + buffer.readUInt16BE(constants.streamHeader.CONTENT_LENGTH_POS));
                            pendingAudioStreamBytes += buffer.readUInt16BE(constants.streamHeader.CONTENT_LENGTH_POS);
                            rawInputStream.writeBuffer(buffer.slice(constants.streamHeader.CONTENT_POS));
                            break;
                        case constants.streamHeader.streamIdentifiers.CONTROL:
                            if (buffer.readUInt16BE(constants.streamHeader.CONTENT_LENGTH_POS) == constants.streamHeader.CONTROL_CHARACTER_LENGTH) {
                                switch (buffer.readUInt16BE(constants.streamHeader.CONTENT_POS)) {
                                    case constants.streamHeader.controlCharacters.INIT:
                                        console.log("Recording-initiate request");
                                        musicPlayer.pause(function () {
                                            microphoneSocket.writeControlValue(constants.microphoneResponse.PROCEED_WITH_RECORDING, function () {
                                                console.log("Control value written");
                                            });
                                        });
                                        break;
                                    case constants.streamHeader.controlCharacters.END:
                                        console.log("Recording-end request");
                                        microphoneSocket.endRecording();
                                        break;
                                    case constants.streamHeader.controlCharacters.TIMEOUT:
                                        microphoneSocket.onRecordingError("Request timed-out");
                                        break;
                                    case constants.streamHeader.controlCharacters.PLAY_PAUSE_TOGGLE:
                                        if (!microphoneStreamOpen) {
                                            console.log("playPauseToggle request");
                                            musicPlayer.playPauseToggle();
                                        }
                                        break;
                                    case constants.streamHeader.controlCharacters.NEXT_SONG:
                                        if (!microphoneStreamOpen) {
                                            console.log("nextSong request");
                                            musicPlayer.next();
                                        }
                                        break;
                                }
                            }
                            break;
                    }
                }
            }
            else {
                rawInputStream.writeBuffer(buffer);
            }
        }
    });

    serverSocket.on('speech-to-text', function (response) {
        if (response.requestId == microphoneSocket.id) {
            if (musicPlayer.searchAndPlay(response)) {
                console.log("Microphone request successful");
                microphoneSocket.writeControlValue(constants.microphoneResponse.REQUEST_PROCESSING_SUCCESS);
            }
            else {
                console.log("Microphone request failed");
                microphoneSocket.writeControlValue(constants.microphoneResponse.REQUEST_PROCESSING_FAILURE);
            }
        }
        else {
            console.log("Response received for stale requestId : " + response.requestId);
        }
    });

    microphoneSocket.on('close', function (data) {
        console.log('CLOSED: ' + microphoneSocket.remoteAddress + ' ' + microphoneSocket.remotePort);
        if (microphoneStreamOpen || data.error) {
            microphoneSocket.endRecording();
            microphoneSocket.onRecordingError("Microphone socket closed prematurely");
        }
    });

    microphoneSocket.on('error', function (err) {
        console.log('Received socket error : ' + err);
        console.error(err.stack);
    });
});

/***Communication with the server***/

serverSocket.on('connect', function () {
    console.log('ServerSocket connected');
    microphoneServer.listen(8080, '192.168.0.200', function () {
        console.log("Microphone socket listening");
    });
});

serverSocket.on('disconnect', function () {
    console.log("ServerSocket disconnected");
    microphoneServer.close(function () {
        console.log("MicrophoneServer closed");
    });
});