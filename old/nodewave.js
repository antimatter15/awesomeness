var http = require('http');
var url = require('url');
var crypto = require('crypto')
var msgs = {}; //meh, doesnt persist
var signatures = {};
var subscriptions = {};
//default message properties
var gdefault = {
	write: true,
	write_text: true,
	read_text: true,
	read_meta: true,
	write_meta: true
}

/*
	{ //message acl schema
		acl: {
			default: {
				
			}
			'host': {
				
			}
		}
	}
*/

function validateSignature(user, sig, data, callback, fail){
	console.log(user)
	var u = url.parse(user); //URL
	
	var host = u.protocol+'//'+u.host; //host name

	if(host in signatures){
		//verify signature
		console.log('verifying signature')
		var valid = crypto.createHmac('sha1', signatures[host])
			.update(data)
			.digest('hex') == sig;
		
		if(valid){
			callback(host);
			console.log('signature win')
		}else{
			fail();
			console.log('signature fail')
		}
	}else{
		console.log('querying signature')
		var cl = http.createClient(u.port||80, u.hostname);
		var req = cl.request('GET','/get_key/'+sig);
		req.end();
		req.on('response', function(res){
			console.log('getting response')
			var all = '';
			res.on('data', function(c){
				all += c;
			})
			res.on('end', function(){
				signatures[host] = all;
				console.log('trying to verify again')
				validateSignature(user, sig, data, callback, fail);
			})
		})
	}
}

function parseOps(host, res, ops){
	res.writeHead(200, {'Content-Type': 'text/plain'});
	console.log(JSON.stringify(msgs))
	var nops = ops.map(function(op){
		console.log('parsing op type',op.type)
		//todo: live json encoding
		
		if(!(op.id in msgs)){ //todo: control over which hosts can create a blip
			msgs[op.id] = {
				id: op.id,
				version: 0,
				text: '',
				history: [],
				acl: {
					def: {}
				}
			}
		}
		
		var msg = msgs[op.id];
		
		var cap = {};
		var hcap = msg.acl[host];
		for(var i in gdefault){
			cap[i] = gdefault[i];
		}
		for(var i in msg.acl.def){
			cap[i] = msg.acl.def[i];
		}
		for(var i in hcap){
			cap[i] = hcap[i];
		}
		
		if(op.type == 'sub'){ //does not need permissions?
			if(!(op.id in subscriptions)){
				subscriptions[op.id] = [];
			}
			subscriptions[op.id].push(op.url);
			return {
				type: op.type,
				id: op.id
			}
		}else if(op.type == 'load'){
			var msg = msgs[op.id];
			return {
				type: op.type,				
				id: msg.id,
				acl: msg.acl, //access control lists important
				lastModified: msg.lastModified,
				text: msg.text
			}
		}else if(op.type == 'history'){
			var msg = msgs[op.id];
			return {
				type: op.type,
				id: msg.id,
				history: msg.history
			}
		}else if(op.type == 'modify'){
			if(cap.write){
				msg.lastModified = +new Date;
				msg.history.push(op);
				msg.text = op.text;
				msg.version++;
				console.log('updated message to v',msg.version)
				publish(op.id, op)
				return {
					type: op.type,
					success: 'ftw'
				}
			}else{
				return {
					type: op.type,
					fail: 'bad permissions. can not write'
				}
			}
		}
	})
	var snops = JSON.stringify(nops);
	console.log('response:',snops)
	res.write(snops);
  res.end();
}

function publish(id, op){
	var i = subscriptions[id];
	if(!i) return; //no one is subscribing.
	var msg = msgs[id];
	console.log('publishing')
	for(var l = i.length; l--;){
		var u = url.parse(i[l]);
		var cl = http.createClient(u.port||80, u.hostname);
		var req = cl.request('POST',u.pathname);
		req.write(JSON.stringify({
			id: id,
			version: msg.version,
			op: op
		}))
		req.end();
	}
}


http.createServer(function (req, res) {
	if(req.method != 'POST'){
			console.log('not real post waah')
			res.writeHead(404, {'Content-Type': 'text/plain'});
			res.write('FAIL NOT POST');
			res.end(); //is this valid node?
			return;
	}
	console.log('got a request')
	var chunks = '';
	//TODO: live JSON parser
	req.on('data', function(chunk){
		chunks += chunk;
	})
	req.on('end', function(){
		console.log(JSON.stringify(req.headers))
		validateSignature(req.headers.host, req.headers.sig, chunks, function(host){
			var json = JSON.parse(chunks);
			console.log('DATA',chunks)
			parseOps(host, res, json);	
		},function(){
			res.end();
		})
	})
}).listen(8124, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8124/');