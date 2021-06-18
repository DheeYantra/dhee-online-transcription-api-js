function DheeTranscriptionApi (config) {
    const SAMPLE_RATE = 16000;
    const SAMPLE_SIZE = 16;
    const MY_SERVER = 'dev-runtime.dhee.net.in';

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.language = config.language;
    this.targetContainer = config.targetContainer;
    this.micButton = config.micButton;
    this.callParams = config.callParams;

    this.textBuffer = "\n";
    var socket = null;
    var audioContext;

    
    
    var sessionCreationUrl = 'https://' + MY_SERVER + '/web/get-transcription-channel';

    this.onError = function (error) {
        console.log("Error.")
    }
    this.onConnect = function () {
        console.log("Connected.");
    }
    this.onDisconnect = function () {
        console.log("Disconnected.");
    }
    this.onStartRecording = function() {
        console.log("Recording started");
    }
    this.onStopRecording = function() {
        console.log("Stopped recording.");
    }

    this.setEventHandler = function (event, handler) {
        switch (event) {
            case "connected": this.onConnect = handler; break;
            case "disconnected": this.onDisconnect = handler; break;
            case "error": this.onError = handler; break;
            case "startRecording": this.onStartRecording = handler; break;
            case "stopRecording": this.onStopRecording = handler; break;
        }
    }

    this.stop = function () {
        this.listening = false;
        this.stopDheeAsr();
    }

    this.start = function () {
        this.initiateSession();
    }

    this.initiateSession = function () {

        var dheeTranscriptionApi = this;
        
        var config = {
            apiKey: this.apiKey,
            apiSecret: this.apiSecret,
            language: this.language,
            callParams: this.callParams ? this.callParams : {}
        }
        var sessionKey = false;

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (this.readyState != 4) return;

            if (this.status == 200) {
                var res = JSON.parse(this.responseText);
                if (res.success === true) {
                    sessionKey = res.result;
                    console.log("Got sessionKey :" + sessionKey);
                    dheeTranscriptionApi.initializeSpeechRecognition(sessionKey);
                } else {
                    dheeTranscriptionApi.onError(res.result);
                }
            } else {
                dheeTranscriptionApi.onError("Cannot reach Dhee cloud. Response code " + this.status);
            }
        };

        xhr.open("POST", sessionCreationUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(config));
    }

    this.initializeSpeechRecognition  = function (sessionKey) {
        var dheeTranscriptionApi = this;
        this.sessionKey = sessionKey;
        var microphoneStreamSource;

        function newWebsocket(transcriptionKey) {

            var audioPromise = navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    channelCount: 1,
                    sampleRate: {
                        ideal: SAMPLE_RATE
                    },
                    sampleSize: SAMPLE_SIZE
                }
            });

            var websocketPromise = new Promise(function (resolve, reject) {

                var callConnectionUrl = 'wss://' + MY_SERVER + "/voice-transcription/";

                socket = new WebSocket(callConnectionUrl + transcriptionKey);
                socket.binaryType = "arraybuffer";
                socket.addEventListener('open', resolve);
                socket.addEventListener('error', reject);
                return socket;

            });

            Promise.all([audioPromise, websocketPromise]).then(function (values) {

                var micStream = values[0];
                socket = values[1].target;

                audioContext = new (window.AudioContext || window.webkitAudioContext)(/*{ sampleRate: 16000 }*/);

                var websocketProcessorScriptNode = audioContext.createScriptProcessor(8192, 1, 1);

                const MAX_INT = Math.pow(2, 16 - 1) - 1;

                function downsample(buffer, fromSampleRate, toSampleRate) {
                    // buffer is a Float32Array
                    var sampleRateRatio = Math.round(fromSampleRate / toSampleRate);
                    var newLength = Math.round(buffer.length / sampleRateRatio);

                    var result = new Float32Array(newLength);
                    var offsetResult = 0;
                    var offsetBuffer = 0;
                    while (offsetResult < result.length) {
                        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
                        var accum = 0, count = 0;
                        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                            accum += buffer[i];
                            count++;
                        }
                        result[offsetResult] = accum / count;
                        offsetResult++;
                        offsetBuffer = nextOffsetBuffer;
                    }
                    return result;
                }

                websocketProcessorScriptNode.addEventListener('audioprocess', function (e) {

                    var floatSamples = e.inputBuffer.getChannelData(0);
                    var fromSampleRate = audioContext.sampleRate;
                    var toSampleRate = 16000;
                    if (fromSampleRate != toSampleRate) {
                        //console.log("micSamplingRate:" + fromSampleRate + "; Resampling to 16K");
                        floatSamples = downsample(floatSamples, fromSampleRate, toSampleRate);
                    }

                    socket.send(Int16Array.from(floatSamples.map(function (n) {
                        return n * MAX_INT;
                    })));
                });

                dheeTranscriptionApi.websocketProcessorScriptNode = websocketProcessorScriptNode;


                socket.addEventListener('close', function (e) {
                    console.log("Dhee ASR websocket closed");
                });
                socket.addEventListener('error', function (e) {
                    console.log('Error from Dhee ASR websocket', e);
                });
                socket.addEventListener('message', onTranscription);

                function sendInitParams() {
                    var config = {
                        transcriptionKey: transcriptionKey
                    }
                    socket.send(JSON.stringify(config));
                }

                function startByteStream(e) {
                    microphoneStreamSource = audioContext.createMediaStreamSource(micStream);
                    microphoneStreamSource.connect(websocketProcessorScriptNode);
                    websocketProcessorScriptNode.connect(audioContext.destination);
                    dheeTranscriptionApi.listening = true;
                    dheeTranscriptionApi.onStartRecording();
                }

                function onTranscription(message) {

                    if (typeof message.data === "string") {

                        /*console.log("Got Text: " + message.data);*/
                        if (message.data == "startStreaming") {
                            console.log("Starting to stream audio");
                            dheeTranscriptionApi.dheeAsrInUse = true;
                            startByteStream();
                        } else {
                            var packet = JSON.parse(message.data);
                            if (packet.status == 0) {
                                dheeTranscriptionApi.targetContainer.innerHTML = dheeTranscriptionApi.textBuffer + packet.transcript;
                            }

                            if (packet.status == 1) {
                                dheeTranscriptionApi.textBuffer = dheeTranscriptionApi.textBuffer + packet.transcript + "\n";
                                dheeTranscriptionApi.targetContainer.innerHTML = dheeTranscriptionApi.textBuffer;
                            }
                        }
                        return;
                    }
                }

                sendInitParams();


            }).catch(console.log.bind(console));
        }

        function closeWebsocket() {
            try {
                if (socket && socket.readyState === socket.OPEN) {
                    socket.close();
                }
            } catch (error) {
                console.error(error);
            }
            dheeTranscriptionApi.onStopRecording();
        }

        function cleanUp() {
            try {
                console.log("cleaning up connections");
                if (dheeTranscriptionApi.websocketProcessorScriptNode) {
                    dheeTranscriptionApi.websocketProcessorScriptNode.disconnect();
                }
                if (microphoneStreamSource) {
                    microphoneStreamSource.disconnect();
                }
                if (audioContext && audioContext.state != 'closed') {
                    audioContext.close();
                    delete audioContext;
                }

            } catch (error) {
                console.error(error);
            }
        }

        function toggleWebsocket(e) {
            var context = e.target;
            if (context.state === 'running') {
                newWebsocket();
            } else if (context.state === 'suspended') {
                setTimeout(function () {
                    closeWebsocket();
                }, 1500);
            }
        }

        dheeTranscriptionApi.newWebsocket = newWebsocket;
        dheeTranscriptionApi.stopDheeAsr = function () {
            cleanUp();
            closeWebsocket();
            dheeTranscriptionApi.listening = false;
        };
        
        dheeTranscriptionApi.setupComplete = true;
        newWebsocket(sessionKey);
    }

    this.isListening = function() {
        return this.listening;
    }

    

}