//Storage
var url = require('url'),
		fs = require('fs'),
		crypto = require('crypto'),
	  http = require('http');


var my_url = 'http://localhost:8124' //remember no trailing slash
var msgs = {}; //partial IDs, excludes host
var token_secret = 'aksdljffsdakfwekwljr'
var globalacl = {
	write_acl: true,
	write_elements: true,
	add_children: true,
	write_text: true
};


var msgs = {}; //Full IDs: host/message.

//crappy diff algorithm which handles simple replace cases
//returns range of change:        [  ] -> []
//example:
//> diff('the huge cute pink elephant ate children',
//       'the huge cute gray elephant ate children')
//[14, 18, "gray"]
function diff(a, b){
  var al = a.length, bl = b.length, s = -1, e = -1;
  while(s++ < al && a[s] == b[s]);
  while(e++ < al && a[al-e] == b[bl-e]);
  return [s,al-e+1,b.substring(s,bl-e+1)]
}


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
			elements: {}, //elements are similar to annotations and elements in wave
			//handling is similar to ACLs.
			/*
				{
					'dfjlaskdjf': { //element ID
						start: 0 //place in text where it begins
						end: 0 //place in text where it ends (optional)
						
						url: //gadgets
						state_blah: //gadget state
					}
				}
			*/
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
	
	//if(delta.v != msg.v){
	//	//version mismatch. FAIL
	//	throw 'version mismatch'
	//}
	
	var can = getACL(host, msg);
	
	var changed = false;
	
	if(can.write_acl && delta.acl){
		for(var i in delta.acl){
			msg.acl[i] = msg.acl[i] || {};
			changed = true;
			for(var k in delta.acl[i])
				msg.acl[i][k] = delta.acl[i][k];
		}
	}
	
	if(can.write_elements && delta.elements){
		for(var i in delta.elements){
			msg.elements[i] = msg.elements[i] || {};
			changed = true;
			for(var k in delta.elements[i])
				msg.elements[i][k] = delta.elements[i][k];
		}
	}
	
	if(can.add_children && delta.add_children){
		//TODO: support Reordering
		msg.children = msg.children.concat(delta.add_children);
		changed = true;
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
	
	if(changed == true){
		msg.time = +new Date;
		msg.v++; //increment version
	}
	return changed
}


function publishDelta(msg, delta){
	//send the delta to all the subscribers
	for(var i = 0, l = msg.subscribers.length; i < l; i++){
		var sub = msg.subscribers[i];
		signedPOST(sub+'/push', JSON.stringify(delta), function(){
			//do nothing
		})
	}
}



function loadMessage(id, host, opt){
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

http.createServer(function (req, res) {
	if(req.method == 'POST'){
		var chunks = '';
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			console.log('checking sig')
			checkSecret(req, function(){
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
				
				res.writeHead(200,{})
				var output = {}; //todo: try-catch errors and put in output
				
				res.write(JSON.stringify(output))
				res.end();
				
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
			var host_token = crypto.createHash('sha1')
					.update(token_secret+'//'+req.headers.host)
					.digest('base64');
			if(req.headers.secret == host_token){
				res.writeHead(200);
				res.end('YAY')
			}else{
				res.writeHead(404); //do anohter server error
				res.end('FAIL')
			}
		}else{
			var u = url.parse(req.url, true);
			var mid = u.pathname.substr(1);
			var opt = u.query;
			checkSecret(req, function(){
				if(mid in msgs){
					res.writeHead(200)
					res.end(JSON.stringify(loadMessage(mid, req.headers.host, opt)))
				}else{
					res.writeHead(404)
					//not found
					res.end('{fail: "Message not found"}')
				}
			}, function(){
				res.writeHead(503); //change error code. im offline and cant look it up.
				res.end('Invalid Signature')				
			})
		}
	}
	
}).listen(8124, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8124/');