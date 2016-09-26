var theDoc;

chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('window.html', {
    'outerBounds': {
      'width': 400,
      'height': 350
    }
  }, function(createdWindow) {
  	var win = createdWindow.contentWindow;
  	win.onload = function() {
  		theDoc = win.document;
  	}
  });
});

function doAlert(data) {
	//theDoc.getElementById("alert").innerHTML = data;
	console.log(data);
}

chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
        if (request) {
            if (request.message) {
                if (request.message == "version") {
                	doAlert("Hi");
                    sendResponse({version: 1.0});
                } else if (request.message == "devices") {
                  chrome.serial.getDevices(function(devices) {
                    sendResponse(devices);
                  });
                  return true;
                }
            } 
        }
    });



function convertArrayBufferToString(buf){
  var bufView = new Uint8Array(buf);
  var encodedString = String.fromCharCode.apply(null, bufView);
  return decodeURIComponent(encodedString);
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function writeByte(id, i, msg, progress, done) {
	if (i == 8192) {
		progress(100);
		done();
		return;
	}

	if ((i % 512) == 0) {
		progress(Math.round((i / 8192) * 100));
	}

	var buf = new ArrayBuffer(1);
	var bufView = new Uint8Array(buf);

	bufView[0] = msg.fram[i];
	chrome.serial.send(id, buf, function() {
		chrome.serial.flush(id, function() {

			// Dodo requires a bit of time between each sent byte to deal with it
			sleep(1).then(() => {
				writeByte(id, i + 1, msg, progress, done);
			});
		});
	});
}

chrome.runtime.onConnectExternal.addListener(function(port) {
	doAlert(port.name);
	console.assert(port.name == "dodo_flash");
	port.onMessage.addListener(function(msg) {
		if (msg.fram && msg.path) {
			var id = "";

			var onReceive = function(info) {
				if (info.connectionId == id) {
					var str = convertArrayBufferToString(info.data)
					if (str == "R") {
						doAlert("Got R")

						// Starts off by writing 1
            			writeByte(id, 0, msg, 
            				function(p) {
            					port.postMessage({ progress: p});
            				},
            				function() {
            					chrome.serial.disconnect(id, function() {});

            					port.postMessage({ success: true });
	            				port.disconnect();
            				});
					} else {
						doAlert("Read: " + str)
						port.postMesssage({error: "Invalid Response from Device"});
						chrome.serial.disconnect(id, function() {});
					}
				}
			}

			var onConnect = function(connectionInfo) {
				doAlert("Connected to Serial");
				id = connectionInfo.connectionId;
				chrome.serial.onReceive.addListener(onReceive);
			}

			chrome.serial.connect(msg.path, {bitrate: 19200}, onConnect);
		}
	});
});