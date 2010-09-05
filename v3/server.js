//////////////CONFIGURATION//////////////////
var serverpath = 'http://localhost:8125/'; //remember trailing slash

//////////////CONFIGURATION//////////////////
var url = require('url'),
		fs = require('fs'),
	  http = require('http');

var users = {}
var msgs = {};
var tokens = {};
var server = url.parse(serverpath);
//////////////CONFIGURATION//////////////////


addUser('admin', 'password');



//////////////CONFIGURATION//////////////////


function addUser(username, password){
  users[username] = {
    password: password
  };
  
  //createPrivateMessage(username, '', {read: true}); //create teh profile page.
  //msgs[createPrivateMessage(username, 'inbox')].data.type = 'digest'; //private.
  //msgs[createPrivateMessage(username, 'invites', {write_data: true})].data.type = 'digest'; //unreadable to all. writable to all.
  
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
/*
function createPrivateMessage(user, path, defaults){
  if(path == ''){
    var id = serverpath+'u/'+user;
  }else{
    var id = serverpath+'u/'+user+'/'+path;
  }
  createMessage(id, true);
  defaults = defaults || {};
  msgs[id].acl.def.read = false;
  msgs[id].acl.def.write_data = false;
  msgs[id].acl.def.write_text = false;
  for(var i in defaults){
    msgs[id].acl.def[i] = defaults[i];
  }
  msgs[id].acl[server.host] = {};
  msgs[id].acl[server.host][user] = {
    read: true,
    write_data: true,
    write_text: true
  }
  return id;
}
//*/

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
    clients: [], //another class of subscribers
    subscribers: [],
    ctime: 0, //this is the last time of the last edit of the message or the children. whichever is newer.
    time: 0, //this is the time of the last edit of the message
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
    	if(msg.subscribers.indexOf(host) == -1) msg.subscribers.push('http://'+host+'/push');
	}
}


function subscribeClient(id, URL){
  if(URL){
	  var msg = msgs[id];
	  if(msg){
	    if(msg.clients.indexOf(URL) == -1) msg.clients.push(URL);
	  }
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
	
	var children = [];
	//TODO: switch to regex match/cache regex
	msg.text.replace(/<message\s+name=['"]?(.*)['"]?\s*>/gi, function(all, url){
    //possibility of changing from "name" to something snazzier, like URL
    children.push(url);
  })
	
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
	
	//TODO: switch to regex match/cache regex
	msg.text.replace(/<message\s+name=['"]?(.*)['"]?\s*>/gi, function(all, url){
    //possibility of changing from "name" to something snazzier, like URL
    children.push(url);
    if(children.indexOf(url) == -1){
      //added new child
      children.splice(children.indexOf(url), 1); //remove from childrens list
      msgs[children[i]].parents.push(id);
    }
  });
  
  if(children.length > 0){
    for(var i = children.length; i--;){
      msgs[children[i]].parents.splice(msgs[children[i]].parents.indexOf(id)) //this child was REMOVED
    }
  }
	
	var ctime = +new Date;
	
	msg.time = ctime;
	msg.ctime = ctime; //we know this is the newest. now.
	delta.time = ctime;
	
	msg.v++; //increment version
	msg.history[msg.v] = delta;
	
	
	var propagate_ctime = function(msg){
	  for(var l = msg.parents.length; l--;){
	    msgs[msg.parents[l]].ctime = ctime; //propagate CTIME!
	    pushDelta(msgs[msg.parents[l]].clients, {
	      id: msg.parents[l],
	      ctime: ctime
	    });
	    propagate_ctime(msgs[msg.parents[l]]);
	  }
	};
	propagate_ctime(msg);
	
	/*
	var upath = serverpath+'u/', upl = upath.length;
	for(var i in msgs){
	  if(i.indexOf(upath) == 0){
	    i.substr(upl);
	  }
	}
	*/
	
	pushDelta(msg.subscribers, delta);
	  
  //same thing for this type of situation. different for the recursive thingsies.
	pushDelta(msg.clients, delta);
}


function pushDelta(group, delta){
  var strdelta = JSON.stringify(delta);
  
	for(var i = group.length; i--;){
	  var subscriber = url.parse('http://'+msg.subscribers[i]); //TODO: https
	  console.log(subscriber);
	  //TODO: deal with revoked permissions
	  var client = http.createClient(subscriber.port, subscriber.hostname);
    var request = client.request('POST', subscriber.pathname, {
      'host': server.host,
      'authorization': 'TFV3 TODO_IMPLEMENT_TOKEN_HANDLING'
    }); 
    request.end(strdelta);
    
    //TODO: if there was an error. remove from subscribers.
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
                  subscribeClient(json.id, req.headers.subscribe);
                }
                res.end(JSON.stringify(getMessage(json.id, host, user)));
              })
            });
          }else{
            if(targetlocal){
              createMessage(json.id, user);
            }
            subscribeClient(json.id, req.headers.subscribe);
            res.end(JSON.stringify(getMessage(json.id, host, user)));
          }
        }else if(json.type == 'write'){
          delete json.type;
          if(targetlocal){
            //target is local. go apply the delta.
          	createMessage(json.id, user); //TODO: allow ACL to restrict creation of new messages to outsiders
            subscribeClient(json.id, req.headers.subscribe);
            applyDelta(json.id, json, server.host, user);            
            res.writeHead(200);
            res.end('{}');
          }else{ //TODO: potential issue with subscribing without loading first.
            //target is not local. go proxy request to the target server
            subscribeClient(json.id, req.headers.subscribe);
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
