var url = require('url'),
		fs = require('fs'),
	  http = require('http');

var users = {}
var msgs = {};
var tokens = {};
var server = url.parse(serverpath);
//////////////CONFIGURATION//////////////////

var serverpath = 'http://localhost:8125/'; //remember trailing slash
addUser('admin', 'password');



//////////////CONFIGURATION//////////////////


function addUser(username, password){
  users[username] = {
    password: password
  };
  
  //createPrivateMessage(serverpath+'u/'+username+'/search_query', username);
}

function b64_decode(str){
  return (new Buffer(str, 'base64')).toString('utf-8');
}

function b64_encode(str){
  return (new Buffer(str)).toString('base64');
}




var globalacl = {
  read: true,
	write_acl: true,
	write_data: true,
	write_text: true
};

function createPrivateMessage(id, user){
  createMessage(id, true);
  msgs[id].acl.def.read = false;
  msgs[id].acl.def.write_data = false;
  msgs[id].acl.def.write_text = false;
  msgs[id].acl[server.host] = {};
  msgs[id].acl[server.host][user] = {
    read: true,
    write_data: true,
    write_text: true
  }
}


function getACL(msg, host, user){
	//Chain: User > Host > Message > Server
	var can = {};
	for(var i in globalacl) can[i] = globalacl[i];
	if(msg.acl.def){
	  for(var i in msg.acl.def) can[i] = msg.acl.def[i];
	}
	if(msg.acl[host]){
	  if(user){
	    for(var i in msg.acl[host][user]) can[i] = msg.acl[host][user][i];
	  }else{
	    for(var u in msg.acl[host]){
	      for(var i in msg.acl[host][u]) can[i] = can[i] || msg.acl[host][u][i];
	    }
	  }
	}
	return can
}


function createMessageCore(id){
  msgs[id] = {
    history: [], //a list of all operations, 0 -> v
    acl: {
      def: {}
    },
    data: {},
    v: 0,
    subscribers: [],
    text: ''
  }
}

function createMessage(id, user){
  if(!(id in msgs)){
    if(url.parse(id).pathname.substr(0,3) == '/m/'){
      createMessageCore(id);
	  }else if(url.parse(id).pathname.indexOf('/u/'+user) == 0){
	    //this is a search query.
      createMessageCore(id);
      msgs[id].acl.def.read = false;
      msgs[id].acl.def.write_data = false;
      msgs[id].acl.def.write_text = false;
      msgs[id].acl[server.host] = {};
      msgs[id].acl[server.host][user] = {
        read: true,
        write_data: true,
        write_text: true
      }
	  }
  }
}

function searchMessages(query, user){
  var qregex = new RegExp(query.replace(/ /g, '.*'), 'gim');
  var matches = [];
  //TODO: one day, use something other than an O(1) search
  for(var id in msgs){
    if(qregex.test(msgs[id].text)){
      var can = getACL(msgs[id], server.host, user);
      if(can.read){
        matches.push(id);
      }
    }
  }
  return matches;
}


function subscribe(id, host){
	var msg = msgs[id];
	if(msg){
	  var can = getACL(msg, host);
	  if(host != server.host && can.read)
    	if(msg.subscribers.indexOf(host) == -1) msg.subscribers.push(host);
	}
}

function getMessage(id, host, user){
	if(!(id in msgs)) throw "Message Not Found";
	
	var msg = msgs[id];
	var can = getACL(msg, host, user);
	
  subscribe(id, host);
	
	if(can.read){
	  var n = {
	    id: id,
		  time: msg.time,
		  v: msg.v
	  };
	
	  n.acl = msg.acl;
	  n.data = msg.data; //todo: ACLS!
	  n.text = msg.text;
  	return n;
	}
	return null;
}

function applyDelta(id, delta, host, user){
  var idurl = url.parse(id);
  
	
	var msg = msgs[id];


	var can = getACL(msg, host, user);

	
	delta.host = host; //dont trust the info supplied by the fed server completely
	delta.user = user || delta.user;
	//delta SHOULD contain a user attribute!
	
  subscribe(id, host);
  
	if(delta.v != msg.v + 1){
		//version mismatch. FAIL
		console.log('Version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v)
		throw 'Version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v
	}
	


	if(can.write_acl && delta.acl){
		var looper = function(d, o){
		  for(var i in d){
			  if(typeof d[i] != 'object'){
			    o[i] = d[i];
			  }else{
			    if(!o[i]) o[i] = {};
			    looper(d[i], o[i]);
		    }
		  }
		};
		looper(delta.acl, msg.acl)
	}
	
	if(can.write_data && delta.data){
		var looper = function(d, o){
		  for(var i in d){
			  if(typeof d[i] != 'object'){
			    o[i] = d[i];
			  }else{
			    if(!o[i]) o[i] = {};
			    looper(d[i], o[i]);
		    }
		  }
		};
		looper(delta.data, msg.data)
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
		
		//list all the referenced messages and try loading them preemptivvely
	}
	
	msg.time = +new Date;
	msg.v++; //increment version
	msg.history[msg.v] = delta;
	
	var upath = serverpath+'u/', upl = upath.length;
	for(var i in msgs){
	  if(i.indexOf(upath) == 0){
	    i.substr(upl);
	  }
	}
	
	
	for(var i = msg.subscribers.length; i--;){
	  var subscriber = url.parse('http://'+msg.subscribers[i]); //TODO: https
	  console.log(subscriber);
	  //TODO: deal with revoked permissions
	  var client = http.createClient(subscriber.port, subscriber.hostname);
    var request = client.request('POST', '/push', {
      'host': server.host,
      'authorization': 'TFV3 TODO_IMPLEMENT_TOKEN_HANDLING'
    }); 
    request.end(JSON.stringify(delta)); //TODO: cache stringified delta
    console.log(JSON.stringify(delta));
  }
}


var listener = http.createServer(function (req, res) {
  var path = url.parse(req.url).pathname;
  if(path == '/auth'){
    //check if authorization is the same is the ones I send
  }
  
	var chunks = ''; req.on('data', function(chunk){chunks += chunk});
	req.on('end', function(){
		var json = JSON.parse(chunks);
		
		//the JSON.id is the magical part
		console.log(json);
		var target = url.parse(json.id); //this tells if the request is local or external
		var targetlocal = target.host == server.host;
		
		/*
		  Verifying Auth Tokens
		  
		  Auth tokens are needed for all types of incoming operations or reads
		    Authorization.
		    Host.
		  
		  Incoming requests originating from a "user"
		    Compare user field with existing cached token
		    If token exists and matches:
		      Continue
		    If the token exists and fails:
		      EXPLODE
		    If the token doesn't exist:
		      EXPLODE
		    
		    Now that we know that the token exists and matches. yay.  
		    
		    If the target is local:
		      Apply Delta
		      
		    If the target is external:
		      Proxy Request
		      
		  Incoming requests originating from another server.
		    Compare the host field with the existing cached token
		    If the token exists and matches:
		      Continue
		    If the token exists and fails:
		      EXPLODE
		    If the token doesn't exist:
		      Download token and retry.
		    
		    Apply delta.
		
		*/
		
		//First step. Determine if it's from a user or from another server.
		
    var host = req.headers.host;
	  var auth = req.headers.authorization;
	  var authtype = auth.substr(0, auth.indexOf(' '));
	  var authstr = auth.substr(authtype.length+1);
	  
	  if(authtype == 'Basic'){
	    //users use HTTP BASIC AUTH
	    var authdata = b64_decode(authstr).split(':');
	    var user = authdata[0], pass = authdata[1];
	    //TODO: better way to dish out updates
	    if(users[user].password == pass){
        console.log('user authentication for '+user+' has succeeded');	    
        //YAY NOW WE CAN ACTUALLY DO STUFF!!!!!!
        //check if JSON has write operations that need to go to the 
        
        json.user = user; //set the username of the person submitting the request.
        
        if(json.type == 'load'){
          //load latest version of thing
          res.writeHead(200);
          if(!targetlocal && !(json.id in msgs)){
            var client = http.createClient(target.port, target.hostname);
            var request = client.request('POST', '/', {
              'host': server.host,
              'authorization': 'TFV3 TODO_IMPLEMENT_TOKEN_HANDLING'
            }); 
            request.end(JSON.stringify({
              type: 'load',
              id: json.id
            }));
            request.on('response', function(response){
              var all = '';response.on('data', function(chunk){all += chunk});
              response.on('end', function(){
                var msg = JSON.parse(all);
                if(msg){
                  msgs[json.id] = msg;
                  subscribe(json.id, host); //the requesting proxy server should also recieve updates
                }
                res.end(JSON.stringify(getMessage(json.id, host, user)));
              })
            });
          }else{
            if(targetlocal){
              createMessage(json.id, user);
            }
            subscribe(json.id, host); //the requesting proxy server should also recieve updates
            res.end(JSON.stringify(getMessage(json.id, host, user)));
          }
        }else if(json.type == 'write'){
          delete json.type;
          if(targetlocal){
            //target is local. go apply the delta.
          	createMessage(json.id, user); //TODO: allow ACL to restrict creation of new messages to outsiders
            subscribe(json.id, host); //the requesting proxy server should also recieve updates
            applyDelta(json.id, json, server.host, user);            
            res.writeHead(200);
            res.end('{}');
          }else{ //TODO: potential issue with subscribing without loading first.
            //target is not local. go proxy request to the target server
            subscribe(json.id, host); //the requesting proxy server should also recieve updates
            var client = http.createClient(target.port, target.hostname);
            var request = client.request('POST', '/', {
              'host': server.host,
              'authorization': 'TFV3 TODO_IMPLEMENT_TOKEN_HANDLING'
            }); 
            request.end(JSON.stringify(json));
            request.on('response', function(response){
              /*
              response.on('data', function(chunk){
                res.write(chunk);
              });
              response.on('end', function(){
                res.end();
              })
              */
            	res.writeHead(200);
              res.end('{}'); //usually ops dont actually return data. right?
            });
            
          }
        }
        
      }else{
        console.log('user authentication for '+user+' has failed');
      }
	  }
	  
	  if(authtype == 'TFV3'){ //five random characters. Actually, its something like token failure 3
	    //btw. i can count. there was a fifth letter, that was very enlightening but i got rid of it
	    //so have fun guessing what it was and where it was. 180 potential permutations, only one was
	    //what i meant. but i'll probably forget if you ask me.(new Buffer('aGVsbG8=','base64')).toString('utf-8')

	    //these use a magical little thingy.
	    
	    var check_token = function(){
        if(tokens[host] == authstr || true){ //TODO: IMPLEMENT TOKEN HANDLING
          console.log('host authentication for '+host+' has succeeded');
          //YAY NOW WE CAN ACTUALLY DO STUFF!!!!!!
          if(targetlocal){ //since it's a request from external, we know that the target has to be internal. Right?
            //no subscriptions since all subscribes are implicit
            if(json.type == 'load'){
              //load latest version of thing
              res.writeHead(200);
              res.end(JSON.stringify(getMessage(json.id, host))); //usually ops dont actually return data. right?
            }else if(json.type == 'write'){
              delete json.type;
            	createMessage(json.id);
              applyDelta(json.id, json, host, json.user);
              res.writeHead(200);
              res.end('{}'); //usually ops dont actually return data. right?
            }
            
          }else{ //should this check be up at the authtype section?
            console.log('external request for non internal URL. fail');
          }
        }else{
          console.log('host authentication for '+host+' has failed');
        }
      };
	    if(host in tokens || true){  //TODO: IMPLEMENT TOKEN HANDLING
        check_token();
      }else{
        console.log('caching request token for '+host);
        setTimeout(function(){
          //implement this later. 
          check_token();
        }, 100);
      }
	  }
	})
});
listener.listen(parseInt(server.port), server.hostname);
console.log('Server running at http://'+server.host);
