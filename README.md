# dhee-online-transcription-api-js

The JavaScript library to perform online transcription of spoken audio by connecting to speech recognition service at Dhee.AI cloud.


Download the JS file [dhee-transcription-api.js](https://raw.githubusercontent.com/DheeYantra/dhee-online-transcription-api-js/dhee-transcription-api.js)  and include it in your page's scripts.

An example usage is as below:
```javascript

	var transcriptionTarget = document.getElementById("transcript");
	var micButton = document.getElementById("mic");
	var selectedLanguage = document.getElementById("language").value;
		
	var config = {
			apiKey:"[YOUR DHEE API KEY]",
			apiSecret: "[YOUR DHEE API SECRET FOR ABOVE KEY]",
			language: selectedLanguage,
			targetContainer: transcriptionTarget,
			micButton : micButton,
			callParams : {}
	}
		
    	var transcriptionApi = new DheeTranscriptionApi(config);
    
    	transcriptionApi.setEventHandler("startRecording", function() {
		micButton.style.color = "red";
	});
    
	transcriptionApi.setEventHandler("stopRecording", function() {
		micButton.style.color = "gold";
	});
    
	micButton.onclick = function() {
		if (transcriptionApi.isListening()) {
			transcriptionApi.stop();
		} else {
			transcriptionApi.start();
		}
	}

```


The streaming speech recognition is started as below : 

```javascript

transcriptionApi.start();

```

And stopped with : 

```javascript

transcriptionApi.stop();

```

**Supported languages are : ENGLISH, HINDI, BANGLA, TAMIL, TELUGU, KANNADA, MARATHI, GUJARATI, MALAYALAM**

Event handlers can be set as below :
```javascript

		transcriptionApi.setEventHandler("[event name]", function() {
			micButton.style.color = "gold";
		});

```
Events supported are startRecording, stopRecording, connected, disconnected, error.


Issue reports, fix/extention PRs are welcome!

