//Storage
var url = require('url'),
		fs = require('fs'),
		sign = require('./communication'),
	  http = require('http');

sign.set_url('http://localhost:8125');
sign.set_secret('laf324ojip3jgf4ilurkwoe82');

var msgs = {}; //partial IDs, excludes host

var globalacl = {
	write_acl: true,
	write_elements: true,
	add_children: true,
	write_text: true
};


var msgs = {}; //Full IDs: host/message.


function getACL(host, msg){
	//Chain: HostSpecific > MessageDefault > GlobalServerDefault
	var can = {};
	for(var i in globalacl) can[i] = globalacl[i];
	for(var i in msg.acl.def) can[i] = msg.acl.def[i];
	for(var i in msg.acl[host]) can[i] = msg.acl[host][i];
	return can
}


function applyDelta(id, host, delta){
	if(!(id in msgs)){
		msgs[id] = {
			history: [], //a list of all operations, 0 -> v
			acl: {
				def: {}
			},
			elements: {},
			v: 0,
			subscribers: [],
			children: [],
			text: ''
		}
	}
	
	delta.host = host; //dont trust the info supplied by the fed server completely
	delta.user = delta.user || 'undefined';
	//delta SHOULD contain a user attribute!
	var msg = msgs[id];
	
	if(delta.v != msg.v + 1){
		//version mismatch. FAIL
		throw 'version mismatch'
	}
	
	var can = getACL(host, msg);

	if(can.write_acl && delta.acl){
		for(var i in delta.acl){
			msg.acl[i] = msg.acl[i] || {};
			for(var k in delta.acl[i])
				msg.acl[i][k] = delta.acl[i][k];
		}
	}
	
	if(can.write_elements && delta.elements){
		for(var i in delta.elements){
			msg.elements[i] = msg.elements[i] || {};
			for(var k in delta.elements[i])
				msg.elements[i][k] = delta.elements[i][k];
		}
	}
	
	//TODO: support Reordering	
	if(can.add_children && delta.add_children)
		msg.children = msg.children.concat(delta.add_children);

	
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
	
	if(!msg.history) msg.history = [];
	
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
		children: msg.children
	};
	
	n.acl = msg.acl;
	n.text = msg.text;
	
	if(opt.history)
		n.history = msg.history; //TODO: Read ACLs
	
	return n;
}


function loadMessage(id, callback, opt){
	if(id in msgs){
		if(callback) callback(getMessage(id, sign.my_url));
	}else{
		console.log('load message stuff')
		sign.GET(id+"?history=true&subscribe=true", function(all){
			console.log(all)
			var json = JSON.parse(all);
			msgs[id] = json;
			loadMessage(id, callback, opt)
			
			for(var i = msgs[id].children, l = i.length; l--;){
				loadMessage(i[l]); //just cache it and subscribe
			}
		})
	}
}


var comet_listeners = {};

http.createServer(function (req, res) {
	if(req.method == 'POST'){
		var chunks = '';
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			if(req.url == '/push'){
				sign.check(req, function(){
					res.writeHead(200)
					var json = JSON.parse(chunks);
					console.log('applying delta for ',json.id)
					applyDelta(json.id, req.headers.host, json)
					res.end();
					console.log('push kame frum',json.id)
					var cl = comet_listeners[json.id];
					json.v = msgs[json.id].v;
					var op = JSON.stringify(json)
					if(cl){
						for(var i = cl.length;i--;)
							cl[i].end(op); //get rid of it!
					}
					comet_listeners[json.id] = [];
				},function(){
					console.log('failed signature');
					res.writeHead(503);
					res.end('FAILED SIGNATURE')
				})
			}else{
				var json = JSON.parse(chunks);
				json.subscribe = true;
				//hmmm. subscriptions. hmm.
				res.writeHead(200,{})
				sign.POST(json.id, JSON.stringify(json), function(stuff){
					res.end(stuff)
				})
			}
		})
	}else if(req.method == 'GET'){
		//webinterface is testing ONLY
		if(req.url == '/' || req.url == ''){
			fs.readFile('federation.html', function(err, data){
				if(err) throw err;
				res.writeHead(200,{'content-type': 'text/html'});
				res.end(data)
			})
		}else if(req.url == '/auth'){
			sign.auth(req, res);
		}else if(req.url.substr(0,6) == '/comet'){
			var poop = url.parse(req.url, true);
			var v = parseInt(poop.query.v,10);			
			var p = poop.query.url;
			res.writeHead(200)
			if(msgs[p] && v < msgs[p].v){
				var j = JSON.parse(JSON.stringify(msgs[p].history[v++]));
				j.v = v;
				res.end(JSON.stringify(j));
				return;
			}
			console.log('new listener for req from ',url)
			if(!comet_listeners[p]) comet_listeners[p] = [];
			comet_listeners[p].push(res);
		}else if(req.url.indexOf('/loadmsg') == 0){
			var u = url.parse(req.url, true);
			var opt = u.query;
			loadMessage(opt.url, function(data){
				res.writeHead(200)
				console.log('WHOOOOOTTTT',JSON.stringify(data))
				res.end(JSON.stringify(data))
			})
		}
	}
	
}).listen(8125, "127.0.0.1");



console.log('Server running at http://127.0.0.1:8125/');