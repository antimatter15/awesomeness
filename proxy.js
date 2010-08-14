var http = require('http');
var url = require('url');
var crypto = require('crypto')
var secret = Math.random().toString(36).substr(3);
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

function hostSig(host){
	return crypto.createHash('sha1').update(host+secret).digest('hex')
}

var sigcache = {}

function signRequest(url, data){
	var u = url.parse(url);
	var cl = http.createClient(u.port||80, u.hostname);
	var host = u.protocol+'//'+u.host; //host name
	var msig = crypto.createHmac('sha1', hostSig(host)).update(data).digest('hex');
	sigcache[msig] = host;
	var req = cl.request('POST', u.pathname, {
		sig: msig,
		host: 'http://localhost:8125'
	});
	req.write(data);
}


http.createServer(function (req, res) {
	if(req.url == '/push'){
		//update ping
	}else if(req.url.substr(0,9) == '/get_key/'){
		if(sigcache[req.url.substr(9)]){
			req.write(hostSig(sigcache[req.url.substr(9)]))
			delete sigcache[req.url.substr(9)];
		}
		req.end();
		//get key
	}else{
		var chunks = '';
		//TODO: live JSON parser
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			parseOps(res, JSON.parse(chunks));
		})
	}
}).listen(8125, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8125/');