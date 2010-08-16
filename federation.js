//Storage
var url = require('url'),
		fs = require('fs'),
		crypto = require('crypto'),
	  http = require('http');


var my_url = 'http://localhost:8125' //remember no trailing slash
var msgs = {}; //partial IDs, excludes host
var token_secret = 'ekwedljfwwesfsdakfwewwsfwljr'
var globalacl = {
	write_acl: true,
	write_elements: true,
	add_children: true,
	read_acl: true,
	read_text: true,
	write_text: true
};


/*
	Through any signed message, there is a signature
	the other party checks that the token is valid
*/
var host_secrets = {};


function getSecret(host_url, token, callback){
	console.log('getting secret of ',host_url)
	var h = url.parse(host_url);
	var host = h.protocol+'//'+h.host;
	var cl = http.createClient(h.port || 80, h.hostname); //todo: default HTTPS
	var req = cl.request('POST','/auth');
	req.write(JSON.stringify({
		token: token,
		host: host
	}))
	req.on('response', function(res){
		var data='';res.on('data', function(d){data+=d});
		res.on('end', function(){
			//store data as the signature used to check other things
			host_secrets[host] = data;
			callback()
		})
	})
	req.end();
}
var host_cache = {}; //todo: fix potential issue with batch requests removing recent sig from cache. race conditions.

function signedRequest(host_url, payload, callback){
	var h = url.parse(host_url);
	var host = h.protocol+'//'+h.host;
	var cl = http.createClient(h.port || 80, h.hostname);
	var host_token = crypto.createHash('sha1')
			.update(token_secret+'//'+host)
			.digest('base64');
	var sig = crypto.createHmac('sha1', host_token)
			.update(payload)
			.digest('base64');
	console.log('host', my_url, 'host token',host_token,'request signature',sig)
	host_cache[host] = sig;
	var req = cl.request('POST', h.pathname, {
		sig: sig,
		host: my_url //reference to self
	});
	req.write(payload);
	req.end();
	req.on('response', function(res){
		var data='';res.on('data', function(d){data+=d})
		res.on('end', function(){
			callback(data)
		})
	})
	
}

function checkSignature(host, sig, data, callback, fail){
	return callback(); 
	
	if(host in host_secrets){
		var hmac = crypto.createHmac('sha1', host_secrets[host])
			.update(data)
			.digest('base64');
		(hmac == sig)?callback():fail();
	}else{
		getSecret(host, sig, function(){
			checkSignature(host, sig, data, callback, fail); //spare a .apply
		})
	}
}



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

function loadMessage(id, callback){
	if(id in msgs){
		if(callback) callback(msgs[id]);
	}else{
		signedRequest(id, JSON.stringify({
			load: true
		}), function(all){
			var json = JSON.parse(all);
			msgs[id] = json;
			for(var i = msgs[id].children, l = i.length; l--;){
				loadMessage(i[l]); //just cache it and subscribe
			}
		})
	}
}

http.createServer(function (req, res) {
	if(req.method == 'POST'){
		var chunks = '';
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			if(req.url == '/auth'){
				console.log('sending auth token')
				var json = JSON.parse(chunks)
				res.writeHead(200,{})
				if(host_cache[json.host] == json.token){
					var host_token = crypto.createHash('sha1')
							.update(token_secret+'//'+json.host)
							.digest('base64');
					res.end(host_token)
				}else{
					console.log(host_cache,json.host)
					console.log('wrong token thingy')
					res.end('phayle');
				}
				
			}else if(req.url == '/push'){
				checkSignature(req.headers.host, req.headers.sig, chunks, function(){
					res.writeHead(200,{})
					var json = JSON.parse(chunks);
					applyDelta(req.headers.host + '/' + json.id, req.headers.host, json)
					res.end();
				},function(){
					console.log('failed signature');
					res.writeHead(503, {});
					res.end('FAILED SIGNATURE')
				})
			}else{
				var json = JSON.parse(chunks);
				json.subscribe = true;
				res.writeHead(200,{})
				signedRequest(json.id, JSON.stringify(json), function(stuff){
					//do nothin?
					//res.write('meow kitty')
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
			return;
		}
	}
	
}).listen(8125, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8125/');