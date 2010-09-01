document.execCommand('useCSS',false,true);

onkeydown = function(e){
  if(e.keyCode == 9){
    document.execCommand('indent',false)
    return false;
  }
}

function insertHTML(html){
  var parent = document.createElement('div');
  parent.innerHTML = html;
  document.getSelection().getRangeAt(0).insertNode(parent.firstChild)
}
function insertOL(){
  insertHTML('<ol><li>List Item One</li></ol>')
}
function insertUL(){
  insertHTML('<ul><li>First Bullet</li></ul>')
}


function inlineReply(){
	var nid = 'http://localhost:8124/m'+Math.random().toString(36).substr(2,3);
						//obviously, 3 characters provides nowhere near enough entropy
						//in a production environment
	var threadcont = document.createElement('div');
	threadcont.className = 'thread';
  var thread = document.createElement('thread');
  threadcont.appendChild(thread);
  document.getSelection().getRangeAt(0).insertNode(threadcont);
  var msg = document.createElement('message');
  msg.setAttribute('name', nid);
  thread.appendChild(msg);
  dynamic_renderer(msg);
}


function renderMsg(id){
	/*
		WARNING:
		these closures are probably prone to memory leaks. FIX IT.
	*/
	if(!(id in msgs)) loadMessage(id);
	
	var d = document.createElement('div');
	d.contentEditable = 'false';
	
	var t = document.createElement('div');
	
	change_dynamic(t, msgs[id].text, dynamic_renderer);
	
	var hdr = document.createElement('div');
	hdr.className = 'header wave-titlebar'
	
	hdr.ondblclick = function(){
	  hdr.innerText = msgs[id].text;
	}
	
	
	hdr.innerText = id+' v'+msgs[id].v+' '+format_time(msgs[id].time);
	d.header = hdr;
	d.appendChild(hdr)
	d.editor = t;
	
	t.className = 'text wave-section'
	
	d.id = id;

  
  var slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = msgs[id].v;
  slider.onchange = function(){
    
  }
  slider.value = slider.max;
  //d.appendChild(slider);
  
  d.update = function(){
    //slider.max = msgs[id].v
    //slider.value = msgs[id].v;
	  if(t.contentEditable == 'false'){
		  change_dynamic(t, msgs[id].text, dynamic_renderer)
	  }
	  hdr.innerText = id+' v'+msgs[id].v+' '+format_time(msgs[id].time);
  }
  var toolbox = document.createElement('div');

	var be = document.createElement('button');
	var toggle_edit = function(){
		set_editable(t.contentEditable != 'false')
	}
	
	var set_editable = function(mode){
	  if(mode){
  		t.contentEditable = 'false';
	    be.innerText = 'Edit'
			d.className = 'message'
	  }else{
  		t.contentEditable = 'true';
	    be.innerHTML = '<b>Done</b>'
			t.focus();
			d.className = 'message edit'
	  }
	}
	
	be.onclick = toggle_edit;
	be.innerText = 'Edit'
	toolbox.appendChild(be)
  var check_updates;
	var b = document.createElement('button');
	b.onclick = function(){
		var nid = 'http://localhost:8124/m'+Math.random().toString(36).substr(2,3);
							//obviously, 3 characters provides nowhere near enough entropy
							//in a production environment.
		var hd = html_dynamic(t);
		var reg;
		var msg = '<message name="'+nid+'"></message>';

		hd += '<div class="thread"><thread>'+msg+'</thread></div>'
		console.log('replying stuff',hd);
		change_dynamic(t, hd, dynamic_renderer);
		console.log(t.innerHTML)
		t.contentEditable = 'true';
		check_updates();
		setTimeout(function(){
  		set_editable(false);
		},100);
	}
	b.innerText = 'Reply'
	toolbox.appendChild(b)
	
	
	var c = document.createElement('button');
	c.onclick = function(){
		var nid = 'http://localhost:8124/m'+Math.random().toString(36).substr(2,3);
							//obviously, 3 characters provides nowhere near enough entropy
							//in a production environment.
							
	  var thread = d.parentNode.parentNode;
	  var msg = document.createElement('message');
	  msg.setAttribute('name', nid);
	  thread.appendChild(msg);
	  dynamic_renderer(msg);
	  
	  
	  var pm = thread.parentNode;
	  while(pm.className != 'message'){
	    pm = pm.parentNode;
	  }
	  
		pm.editor.contentEditable = 'true';
		pm.check_updates();
		setTimeout(function(){
  		pm.editor.contentEditable = false;
		},100);
	}
	c.innerText = 'Continue'
	
	
	toolbox.appendChild(c)
	
	
	
	/*
	var t2 = document.createElement('div');
	t2.innerText = msgs[id].text;
	d.editor = t2;
	t2.className = 't2_temp'
	d.appendChild(t2)
	//*/
	var lasttext = '';
	
	
	
	d.check_updates = check_updates = function(){
	
		if(!t.parentNode || t.contentEditable == 'false'){
			return 
		}
		
		var hd = html_dynamic(t)
		if(msgs[id].text == hd){
			return
		}
		
		var delta = diff(msgs[id].text, hd) //TODO: something smarter
		
		console.log('Loaded Version', id, msgs[id].v, 'diff', delta)


	 window.Z = d;
	 
	 
	 
		if(msgs[id].text != lasttext && lasttext != ''){
  		lasttext = hd;
			console.log('odd sync mismatch', lasttext, 'VERSUS', msgs[id].text)
			//loadMessage(id)
			
			return 'delay'
		}
		
		lasttext = hd;
		
		update(id, delta);
	};
	
	var looper;
	setTimeout(looper = function(){
	  var res = check_updates();
	  if(res == 'delay'){
	    setTimeout(looper, 4000);
	  }else{
	    setTimeout(looper, 100);
	  }
	},100)
	
	

	toolbox.className = 'toolbox'

	
	d.appendChild(toolbox);
	d.appendChild(t)
	d.className = 'message'
	
	return d
}



function change_dynamic(node, v2, handler){
	var tmp = document.createElement('div');
	var els = node.querySelectorAll('message,gadget');
	var name_map = {};
	for(var el; el = els[0];){
		name_map[el.getAttribute('name')] = el;
		tmp.appendChild(el);
	}
	node.innerHTML = v2;
	var els = node.querySelectorAll('message,gadget');
	
	for(var l = els.length; l--;){
		var matching_el = name_map[els[l].getAttribute('name')];
		if(matching_el){
			els[l].parentNode.replaceChild(matching_el, els[l]);
		}else{
		  console.log('SUPER NEW BLAH BLAH');
			handler(els[l]);
		}
	}
}



function html_dynamic(el){
  var els = el.querySelectorAll('message,gadget');
	var html = el.innerHTML;
	for(var l = els.length; l--;){
		html = html.replace(els[l].innerHTML, '')
	}
	return html.replace(/&nbsp;$/,' ');
}

/* 
//awesome diff algorithm that i didnt make
function diff(a, b){	
  var al = a.length, bl = b.length, s = -1, e = -1;
	var shortest = (b.length > a.length) ? a.length : b.length;
	
	var i = 0;
	for (; i < shortest; i++) {
		if(a[i] != b[i]) break;
	}
	
	var j = 0;
	for(; j < shortest - i; j++) {
		if(a[al-j] != b[bl-j]) break;
	}
	
	console.log(i,j)
	
  return [i,al-j +1,b.substring(i,bl-j+1)]
}

function undiff(text, r){
	return text.substr(0,r[0]) + r[2] + text.substr(r[1]);
}

*/
function diff(a, b){
	var al = a.length, bl = b.length, shortest = Math.min(bl, al), i = 0, j = 0;
	while(i < shortest && a[i] == b[i]) i++;
	while(j < shortest - i && a[al-j] == b[bl-j]) j++;
  return [i,al-j + 1,b.substring(i,bl-j+1)]
}



