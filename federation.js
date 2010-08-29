//Storage
var url = require('url'),
		fs = require('fs'),
		io = require('./Socket.IO-node/'),
		sign = require('./communication'),
	  http = require('http');

sign.set_url('http://localhost:8125');
sign.set_secret('laf324ojip3jgf4ilurkwoe82');

var msgs = {}; //Full IDs: host/message.



function applyDelta(id, host, delta){
	if(!(id in msgs)){
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
	
	delta.host = host; //dont trust the info supplied by the fed server completely
	
	var msg = msgs[id];
	
	
	//msg.host = host; //the creator
	//msg.creator = delta.user || 'unknown';
	
	delta.user = delta.user || 'unknown';
	//delta SHOULD contain a user attribute!
	
	if(delta.v != msg.v + 1){
		//version mismatch. FAIL
		throw 'version mismatch'
	}
	
	if(delta.acl){
		for(var i in delta.acl){
			msg.acl[i] = msg.acl[i] || {};
			for(var k in delta.acl[i])
				msg.acl[i][k] = delta.acl[i][k];
		}
	}
	
	if(delta.data){
		for(var i in delta.data){
			msg.data[i] = msg.data[i] || {};
			for(var k in delta.data[i])
				msg.data[i][k] = delta.data[i][k];
		}
	}
	
	//A *very* basic totally not working real OT that will have
	//TONS OF COLLISIONS. DO NOT USE THIS IN ANYTHING OTHER THAN
	//A PROTOTYPE!
	if(delta.ot){
		for(var i = 0, l = delta.ot.length; i < l; i++){
			var r = delta.ot[i]; //[14, 18, "gray"]
			msg.text = msg.text.substr(0,r[0]) + r[2] + msg.text.substr(r[1]);
			changed = true;
		}
	}
	
	msg.time = +new Date;
	msg.v++; //increment version
	
	if(!msg.history) msg.history = [];
	
	delta.time = msg.time;
	
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
	var n = {
		time: msg.time,
		host: msg.host,
		creator: msg.creator,
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


var server = http.createServer(function (req, res) {
  var path = url.parse(req.url).pathname;
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
					json.v = msgs[json.id].v;
					push_updates(json)
				},function(){
					console.log('failed signature');
					res.writeHead(503);
					res.end('FAILED SIGNATURE')
				})
			}
		})
	}else if(req.method == 'GET'){
		//webinterface is testing ONLY
		if(req.url == '/' || req.url == ''){
			res.writeHead(301,{'content-type': 'text/html','location': '/client.html'});
			res.end()
		}else if(req.url == '/auth'){
			sign.auth(req, res);
		}else if(req.url.indexOf('/loadmsg') == 0){
			var u = url.parse(req.url, true);
			var opt = u.query;
			loadMessage(opt.url, function(data){
				res.writeHead(200)
				console.log('WHOOOOOTTTT',JSON.stringify(data))
				res.end(JSON.stringify(data))
			})
		}else if (/\.(js|html|swf)$/.test(path)){
			try {
				var swf = path.substr(-4) === '.swf';
				res.writeHead(200, {'Content-Type': swf ? 'application/x-shockwave-flash' : ('text/' + (path.substr(-3) === '.js' ? 'javascript' : 'html'))});
				fs.readFile(__dirname + path, swf ? 'binary' : 'utf8', function(err, data){
					if (!err) res.write(data, swf ? 'binary' : 'utf8');
					res.end();
				});
			} catch(e){ 
				res.writeHead(404);
	      res.write('404');
	      res.end();
			}
		}else{
		  res.writeHead(404);
	    res.write('404');
	    res.end();
		}
	}
});

server.listen(8125, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8125/');


function push_updates(json){
	for(var i = 0; i < listeners[json.id].length; i++){
	  var client = sock.clientsIndex[listeners[json.id][i]];
	  if(client){
	    console.log('sending an update to the client')
	    client.send(json)
	  }
	}
}

// socket.io, I choose you
io.listen(server);

// socket.io, I choose you
// simplest chat application evar
var sock = io.listen(server);

var listeners = {};

sock.on('connection', function(client){
	var subscriptions = [];
  console.log('new client connection',client.sessionId);
	client.on('message', function(message){
	//console.log(message)
		if(message.op){
		  var json = message.op;
			json.subscribe = true;
			//hmmm. subscriptions. hmm.
			sign.POST(json.id, JSON.stringify(json), function(stuff){
				//do i do anything with this. naaah
				//console.log('got the data back')
				//console.log(stuff);
			})
		}else if(message.add){
		  listeners[message.add] = listeners[message.add] || [];
		  listeners[message.add].push(client.sessionId);
		  subscriptions.push(message.add);
		}else if(message.remove){
      listeners[message.remove].splice(listeners[message.remove].indexOf(client.sessionId), 1);
      subscriptions.splice(subscriptions.indexOf(message.remove));
    }
	});

	client.on('disconnect', function(){
		for(var i = 0; i < subscriptions.length; i++){
		  listeners[subscriptions[i]].splice(listeners[subscriptions[i]].indexOf(client.sessionId),1);
		}
	});
});
