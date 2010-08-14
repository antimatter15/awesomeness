var http = require('http');

var msgs = {}; //meh, doesnt persist

function parseOps(res, ops){
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.write(JSON.stringify(ops.map(function(op){
		//todo: live json encoding
		if(op.type == 'load'){
			var msg = msgs[op.id];
			return {
				id: msg.id,
				lastModified: msg.lastModified,
				text: msg.text
			}
		}else if(op.type == 'history'){
			var msg = msgs[op.id];
			return {
				id: msg.id,
				history: msg.history
			}
		}else if(op.type == 'modify'){
			
		}
	})))
  res.end();
}

function signRequest(url){
	
}


http.createServer(function (req, res) {
	if(req.url == '/push'){
		//update ping
	}else if(req.url.substr(0,9) == '/get_key/'){
		//get key
	}
	var chunks = '';
	//TODO: live JSON parser
	req.on('data', function(chunk){
		chunks += chunk;
	})
	req.on('end', function(){
		parseOps(res, JSON.parse(chunks));
	})
		
}).listen(8125, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8125/');