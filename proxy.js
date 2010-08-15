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
		}else if(op.type == 'modify'){
			
		}
	})))
  res.end();
}

function hostSig(host){
	return crypto.createHash('sha1').update(host+secret).digest('hex')
}

var sigcache = {}

function signRequest(uri, data, callback){
	console.log('signing request')
	var u = url.parse(uri);
	var cl = http.createClient(u.port||80, u.hostname);
	var host = u.protocol+'//'+u.host; //host name
	var msig = crypto.createHmac('sha1', hostSig(host)).update(data).digest('hex');
	sigcache[msig] = host;
	console.log('signature',msig)
	var req = cl.request('POST', u.pathname, {
		sig: msig,
		host: 'http://localhost:8125'
	});
	req.write(data);
	req.end();
	console.log('sending')
	req.on('response', function(res){
		console.log('getting response')
		var all = '';
		res.on('data', function(c){
			all += c;
			console.log('heres some data')
		})
		res.on('end', function(){
			//yay done
			callback(all)
			console.log('doneh')
		})
	})
}

function loadMessage(id, callback){
	if(msgs[id]){
		
	}else{
		var mid = url.parse(id);
		signRequest(mid.protocol+'//'+mid.host, JSON.stringify([
			{
				type: 'sub',
				id: mid.pathname.substr(1),
				url: 'http://localhost:8125/push' //reference to self
			},
			{
				type: 'history',
				id: mid.pathname.substr(1)
			}
		]), function(){
			
		})
	}
}


http.createServer(function (req, res) {
	if(req.url == '/push'){
		//update ping
		var chunks = '';
		//TODO: live JSON parser
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			JSON.parse(chunks)
		})
	}else if(req.url.substr(0,9) == '/get_key/'){
		console.log('get key thingy')
		if(sigcache[req.url.substr(9)]){
			console.log('sending key woot')
			res.writeHead(200,{})
			res.write(hostSig(sigcache[req.url.substr(9)]))
			delete sigcache[req.url.substr(9)];
		}
		res.end();
		//get key
	}else if(req.url == '/get'){
		res.writeHead(200,{})

		res.end();
	}else if(req.method == 'POST'){
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