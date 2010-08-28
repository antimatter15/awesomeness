//Storage
var url = require('url'),
		fs = require('fs'),
		sign = require('./communication'),
	  http = require('http');

sign.set_url('http://localhost:8124');
sign.set_secret('ksdjf2wmweiofwtjh5stjeow8ru');

var msgs = {}; //partial IDs, excludes host

var globalacl = {
	write_acl: true,
	write_data: true,
	write_text: true
};


function getACL(host, msg){
	//Chain: HostSpecific > MessageDefault > GlobalServerDefault
	var can = {};
	for(var i in globalacl) can[i] = globalacl[i];
	for(var i in msg.acl.def) can[i] = msg.acl.def[i];
	for(var i in msg.acl[host]) can[i] = msg.acl[host][i];
	return can
}


function createMessage(id){
	msgs[id] = {
		history: [], //a list of all operations, 0 -> v
		acl: {
			def: {}
		},
		data: {},
		v: 0,
		subscribers: [],
		children: [],
		text: ''
	}
}

function applyDelta(id, host, delta){
	if(!(id in msgs)){
		createMessage(id)
	}
	
	delta.host = host; //dont trust the info supplied by the fed server completely
	delta.user = delta.user || 'unknown';
	//delta SHOULD contain a user attribute!
	
	var msg = msgs[id];
	
	
	//msg.host = host; //the creator
	//msg.creator = delta.user || 'unknown';

	
	
	if(delta.v != msg.v + 1){
		//version mismatch. FAIL
		console.log('version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v)
		throw 'version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v
	}
	
	var can = getACL(host, msg);

	if(can.write_acl && delta.acl){
		for(var i in delta.acl){
			msg.acl[i] = msg.acl[i] || {};
			for(var k in delta.acl[i])
				msg.acl[i][k] = delta.acl[i][k];
		}
	}
	
	if(can.write_data && delta.data){
		for(var i in delta.data){
			msg.data[i] = msg.data[i] || {};
			for(var k in delta.data[i])
				msg.data[i][k] = delta.data[i][k];
		}
	}
	
	
	//A *very* basic totally not working real OT that will have
	//TONS OF COLLISIONS. DO NOT USE THIS IN ANYTHING OTHER THAN
	//A PROTOTYPE!
	if(can.write_text && delta.ot){
		for(var i = 0, l = delta.ot.length; i < l; i++){
			var r = delta.ot[i]; //[14, 18, "gray"]
			msg.text = msg.text.substr(0,r[0]) + r[2] + msg.text.substr(r[1]);
			changed = true;
		}
	}
	
	msg.time = +new Date;
	msg.v++; //increment version
	msg.history[msg.v] = delta;
	
	return changed
}


function publishDelta(msg, delta){
	//send the delta to all the subscribers
	for(var i = 0, l = msg.subscribers.length; i < l; i++){
		var sub = msg.subscribers[i];
		sign.POST(sub+'/push', JSON.stringify(delta), function(){
			//do nothing
		})
	}
}



function getMessage(id, host, opt){
	opt = opt || {};
	if(!(id in msgs)){
		//throw erruroh
		throw "Message Not Found"
	}
	var msg = msgs[id];
	var can = getACL(host, msg);
	var n = {
		time: msg.time,
		v: msg.v,
		creator: msg.creator,
		host: msg.host,
		children: msg.children
	};
	
	n.acl = msg.acl;
	n.text = msg.text;
	
	if(opt.history)
		n.history = msg.history; //TODO: Read ACLs
	
	return n;
}

http.createServer(function (req, res) {
	if(req.method == 'POST'){
		var chunks = '';
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			console.log('checking sig')
		  sign.check(req, function(){
				try{
					var mid = req.url.substr(1);
					var delta = JSON.parse(chunks);
					var host = req.headers.host;
					var changed = applyDelta(mid, host, delta)
					var msg = msgs[mid];
					var can = getACL(host, msg);
				
					if(delta.subscribe && msg.subscribers.indexOf(host) == -1)
						msg.subscribers.push(host);
				
					if(changed){
						publishDelta(msgs[mid], delta); //publish delta
					}
				
					res.writeHead(200)
					var output = {}; //todo: try-catch errors and put in output
				
					res.write(JSON.stringify(output))
					res.end();
				}catch(err){
					res.writeHead(500)
					console.log('---------------------------')
					console.log('ERROR!!!')
					console.log('ERROR!!!')
					console.log(err)
					console.log('---------------------------')
					
					res.end('{"fail": "'+err.message+'"}')
				}
			},function(){
				console.log('signature failure')
				res.writeHead(503, {})
				res.end('signature failure')
			})
		})
	}else if(req.method == 'GET'){
		//webinterface is testing ONLY
		if(req.url == '/' || req.url == ''){
			fs.readFile('storage.html', function(err, data){
				if(err) throw err;
				res.writeHead(200,{'content-type': 'text/html'});
				res.end(data)
			})
		}else if(req.url == '/auth'){
			sign.auth(req, res)
		}else{
			var u = url.parse(req.url, true);
			var mid = u.pathname.substr(1);
			var opt = u.query || {};
			var host = req.headers.host;
			sign.check(req, function(){

				if(!(mid in msgs))
					createMessage(mid);
				
				res.writeHead(200)
				if(opt.subscribe && msgs[mid].subscribers.indexOf(host) == -1)
					msgs[mid].subscribers.push(host);
					
				res.end(JSON.stringify(getMessage(mid, req.headers.host, opt)))
				
			}, function(){
				res.writeHead(503); //change error code. im offline and cant look it up.
				res.end('Invalid Signature')				
			})
		}
	}
	
}).listen(8124, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8124/');
