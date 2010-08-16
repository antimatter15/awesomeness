//Storage

var msgs = {
	'test': {
		acl: {
			def: {}
		},
		id: 'test',
		v: 0,
		children: [],
		text: 'hello world'
	}
	
}
var globalacl = {
	write: true, //without this anything else wouldnt work
	write_acl: true,
	add_children: true,
	read: true,
	change_text: true
};

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
	var msg = msgs[id];
	
	if(delta.v != msg.v){
		//version mismatch. FAIL
		return false;
	}
	
	var can = getACL(host, msg);
	if(can.write){
		msg.time = +new Date;
		msg.v++; //increment version
	
		if(can.write_acl && delta.acl){
			for(var i in delta.acl){
				msg.acl[i] = msg.acl[i] || {};
				for(var k in delta.acl[i])
					msg.acl[i][k] = delta.acl[i][k];
			}
		}
		
		if(can.add_children && delta.add_children){
			//TODO: support Reordering
			msg.children = msg.children.concat(delta.add_children);
		}
		
		//A *very* basic totally not working real OT that will have
		//TONS OF COLLISIONS. DO NOT USE THIS IN ANYTHING OTHER THAN
		//A PROTOTYPE!
		if(can.change_text && delta.ot){
			for(var i = 0, l = delta.ot.length; i < l; i++){
				var r = delta.ot[i]; //[14, 18, "gray"]
				msg.text = msg.text.substr(0,r[0]) + r[2] + msg.text.substr(r[1]);
			}
		}
	}
}





console.log(msgs.test.text)

applyDelta('test', 'nothing', {
	ot: [
		[5,6,' shiny ']
	],
	add_children: ['googlepoop']
})

console.log(msgs.test)