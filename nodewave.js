var http = require('http');
var url = require('url');
var crypto = require('crypto')
var http = require('http');
var msgs = {}; //meh, doesnt persist
var signatures = {};
var subscriptions = {};

function validateSignature(user, sig, data, callback, fail){
	var u = url.parse(user); //URL
	var host = u.protocol+'//'+u.host; //host name
	if(host in signatures){
		//verify signature
		var valid = crypto.createHmac('sha1', signatures[host])
			.update(data)
			.digest('hex') == sig;
		
		if(valid){
			callback();
		}else{
			fail();
		}
	}else{
		var cl = http.createClient(u.port||80, u.hostname);
		var req = cl.request('GET','/get_key/'+signature);
		req.end();
		req.on('response', function(res){
			var all = '';
			res.on('data', function(c){
				all += c;
			})
			res.on('end', function(){
				signatures[host] = all;
				validateSignature.apply(this, arguments);
			})
		})
	}
}

function parseOps(res, ops){
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.write(JSON.stringify(ops.map(function(op){
		//todo: live json encoding
		if(op.type == 'sub'){
			if(!(op.id in subscriptions)){
				subscriptions[op.id] = [];
			}
			subscriptions[op.id].push(op.url);
		}else if(op.type == 'load'){
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
			if(!(op.id in msgs)){
				msgs[op.id] = {
					id: op.id,
					version: 0,
					history: []
				}
			}
			var msg = msgs[op.id];
			msg.lastModified = +new Date;
			msg.history.push(op);
			msg.text = op.text;
			msg.version++;
			
			publish(op.id, op)
		}
	})))
  res.end();
}

function publish(id, op){
	var i = subscriptions[id];
	var msg = msgs[id];
	for(var l = i.length; l--;){
		var u = url.parse(i[l]);
		var cl = http.createClient(u.port||80, u.hostname);
		var req = cl.request('POST',u.pathname);
		req.write(JSON.stringify({
			id: id,
			v: msgs.version,
			op: op
		}))
		req.end();
	}
}


http.createServer(function (req, res) {
	if(req.method != 'POST'){
			console.log('not real post waah')
			res.writeHead(404, {'Content-Type': 'text/plain'});
			res.write('FAIL')
			res.end(); //is this valid node?
			return;
	}
	var chunks = '';
	//TODO: live JSON parser
	req.on('data', function(chunk){
		chunks += chunk;
	})
	req.on('end', function(){
		validateSignature(req.headers.host, req.headers.sig, chunks, function(){
			var json = JSON.parse(chunks);
			parseOps(res, json.ops);	
		},function(){
			res.end();
		})
	})
}).listen(8124, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8124/');