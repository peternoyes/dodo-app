var theDoc;

chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('window.html', {
    'outerBounds': {
      'width': 400,
      'height': 408
    }
  }, function(createdWindow) {
  	var win = createdWindow.contentWindow;
  	win.onload = function() {
  		theDoc = win.document;
  	}
  });
});

function doAlert(data) {
	theDoc.getElementById("status").innerHTML = data;
	console.log(data);
}

function startSpin() {
	theDoc.getElementById("gear").className = "fa fa-gear fa-spin";
}

function stopSpin() {
	theDoc.getElementById("gear").className = "fa fa-gear";
}

chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
        if (request) {
            if (request.message) {
                if (request.message == "version") {
                    sendResponse({version: 1.0});
                } else if (request.message == "devices") {
                  doAlert("Requested Device List")
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

var convertStringToArrayBuffer=function(str) {
  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i=0; i<str.length; i++) {
    bufView[i]=str.charCodeAt(i);
  }
  return buf;
};

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function writeString(id, str, done) {
	var buf = convertStringToArrayBuffer(str);
	chrome.serial.send(id, buf, function() {
		chrome.serial.flush(id, function() {
			done();
		})
	});
}


function writeBytes(id, index, count, buffer, done) {
	var buf = new ArrayBuffer(count);
	var bufView = new Uint8Array(buf);

	for (var i = 0; i < count; i++) {
		bufView[i] = buffer[index+i];
	}

	chrome.serial.send(id, buf, function(sendinfo) {
		chrome.serial.flush(id, function() {
			done();
		});
	});
}

var StateEnum = {
	R: 0,
	Ack1: 1,
	Ack2: 2,
};

chrome.runtime.onConnectExternal.addListener(function(port) {
	doAlert(port.name);
	console.assert(port.name == "dodo_flash");
	port.onMessage.addListener(function(msg) {
		if (msg.fram && msg.path) {
			startSpin();

			var id = "";
			var state = StateEnum.R;

			var onReceive = function(info) {
				if (info.connectionId == id) {
					var str = convertArrayBufferToString(info.data);
					
					if (state == StateEnum.R) {
						if (str == "R") {
							state = StateEnum.Ack1;
							writeString(id, "G", function() { });
						} else {
							doAlert("Error: " + str);
							stopSpin();
							port.postMesssage({error: "Invalid Response from Device"});
							chrome.serial.disconnect(id, function() {});
						}
					} else if (state == StateEnum.Ack1) {
						if (str == "A") {
							function next(i) {
								if (i % 512 == 0) {
									var p = Math.round((i / 8192) * 100);
	        						port.postMessage({ progress: p});
        						}

								if (i == 8192)
								{
									state = StateEnum.Ack2;
									return;
								}

								// Can only write 1 byte at a time
								writeBytes(id, i, 1, msg.fram, function() {
									next(i + 1);
								});
							}
							next(0);
						} else {
							doAlert("Error: " + str);
							stopSpin();
							port.postMesssage({error: "Invalid Response from Device"});
							chrome.serial.disconnect(id, function() {});
						}
					} else if (state == StateEnum.Ack2) {
						if (str == "A") {
							stopSpin();
        					doAlert("Success");
        					sleep(10000).then(() => {
        						doAlert("Waiting...");
        					});
        					chrome.serial.disconnect(id, function() {});

        					port.postMessage({ success: true });
            				port.disconnect();
						} else {
							doAlert("Error: " + str);
							stopSpin();
							port.postMesssage({error: "Invalid Response from Device"});
							chrome.serial.disconnect(id, function() {});
						}
					}
				}
			}

			var onConnect = function(connectionInfo) {
				doAlert("Connected");
				id = connectionInfo.connectionId;
				chrome.serial.onReceive.addListener(onReceive);
				chrome.serial.onReceiveError.addListener(function(info) {
					doAlert("Receive Error: " + info.error);
				});
			}

			chrome.serial.connect(msg.path, {bitrate: 9600}, onConnect);
		}
	});
});