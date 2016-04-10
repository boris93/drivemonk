var http = require('http');
var server = require('http').Server();
var io = require('socket.io')(server);
var ss = require('socket.io-stream');
var fs = require('fs');

var decoders = require('./decoders');
var requestHandler = require('./requestHandler');
var utils = require('./utils');

const constants = require('./constants');

io.on('connection', function (socket) {
    socket.on('decoder-connect', function (decoderInfo) {
        decoders.add({
            decoderPreference: decoderInfo.decoderPreference,
            socketId: socket.id
        });
        console.log("Decoder connected : " + socket.id);
    });

    socket.on('decoder-available', function () {
        var decoderInfo = decoders.getDecoderInfo(socket.id);
        if (decoderInfo != null) {
            var pendingRequest = requestHandler.getUnfulfilledRequest(decoderInfo);
            if (pendingRequest != null)
                socket.emit('decoder-availability-check-ping', pendingRequest.getParams());
        }
    });

    socket.on('decoder-availability-check-response', function (requestParams) {
        var decoderInfo = decoders.getDecoderInfo(socket.id);
        if (decoderInfo != null && requestParams.decoderAvailable) {
            var request = requestHandler.getRequest(requestParams.userSocketId);
            if (request != null && request.addDecoder(decoderInfo)) {
                var streamToDecoder = ss.createStream();
                ss(io.sockets.connected[socket.id]).emit('audio-stream', streamToDecoder, requestParams);
                request.pipeAudioStream(streamToDecoder);
                console.log("Streaming to decoder : " + socket.id);
            }
            else {
                socket.emit('invitation-closed');
            }
        }
        else {
            console.log("Decoder unavailable : " + socket.id);
        }

    });

    ss(socket).on('audio-stream', function (streamFromUser, requestParams) {
        if (streamFromUser != null) {
            // Close any previous request from the same user
            socket.closeUserRequest(socket.id);
            // Create a new request
            requestParams.userSocketId = socket.id;
            requestParams.fileName = utils.filenameGen(socket.id);
            var request = requestHandler.createRequest(requestParams);
            streamFromUser.pipe(request.getNewWritableAudioStream());
            // Use the repository stream to write to a file
            request.pipeAudioStream(fs.createWriteStream(constants.speechFileDir + requestParams.fileName + constants.speechFileExtension));
            decoders.get().forEach(function (decoderInfo) {
                if (request.isDecoderCompatible(decoderInfo)) {
                    io.sockets.connected[decoderInfo.socketId].emit('decoder-availability-check-ping', request.getParams());
                }
            });
        }
        else {
            console.log("Invalid streamFormUser");
        }
    });

    socket.on('speech-to-text', function (requestParams) {
        var decoderInfo = decoders.getDecoderInfo(socket.id);
        if (decoderInfo != null) {
            // TODO : modify the decoder identifier
            var fileTextFromDecoder = decoderInfo.socketId.substr(2) + " : " + requestParams.speechToText + "\n";
            fs.appendFile(constants.textFileDir + requestParams.fileName + constants.textFileExtension, fileTextFromDecoder, function (err) {
                if (err) {
                    console.log("Error occured while writing file : " + err);
                    return console.log(err.stack);
                }
                console.log('SpeechToText saved : ' + requestParams.speechToText);
            });
            var request = requestHandler.getRequest(requestParams.userSocketId);
            if (request != null) {
                request.addDecoding(requestParams.speechToText, decoderInfo.decoderPreference.lang);
                var text = request.getText();
                if (text != null) {
                    if (typeof(io.sockets.connected[requestParams.userSocketId]) != 'undefined') {
                        io.sockets.connected[requestParams.userSocketId].emit('speech-to-text', {
                            text: text,
                            requestId: requestParams.requestId
                        });
                    }
                    requestHandler.markRequestComplete(requestParams.userSocketId);
                }
            }
        }
    });

    socket.closeUserRequest = function (userSocketId) {
        var request = requestHandler.getRequest(userSocketId);
        if (request != null) {
            request.abruptEnd();
            request.getDecoders().forEach(function (decoderInfo) {
                io.sockets.connected[decoderInfo.socketId].emit('abrupt-end', request.getParams());
            });
            requestHandler.markRequestComplete(userSocketId);
        }
    };

    socket.on('disconnect', function (data) {
        // This might be a decoder socket
        if (!decoders.remove(socket.id)) {
            // or might be a user socket
            socket.closeUserRequest(socket.id);
            console.log("A user disconnected : " + socket.id);
        }
        else {
            console.log("Decoder disconnected : " + socket.id);
            requestHandler.removeDecoder(socket.id);
        }
    });

    socket.on('user-error', function (data) {
        socket.closeUserRequest(socket.id);
        console.log("A user erred : " + socket.id);
    });

    socket.on('error', function (err) {
        console.log('Received socket error : ' + err);
        console.error(err.stack);
    });
});

server.listen(3000, function () {
    console.log('listening on *:3000');
});