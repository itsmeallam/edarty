var app = require("http").createServer(function(req, res) {
    fs.readFile(__dirname + '/public/index.html',
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }
            res.writeHead(200);
            res.end(data);
     });}),
    io = require("socket.io").listen(app),
    fs = require("fs"),
	ss = require('socket.io-stream')
	path = require('path');

//io.use(router);
app.listen(8080);

var mysql      = require('mysql');
var db = mysql.createPool({
  connectionLimit : 10,
  host     : 'localhost',
  user     : 'root',
  password : '',
  database : 'hospital'});


//var Room = require('./room.js');

var Allsockets = {};
var Clients = {};  
var rooms = {}; 

function makeQuery(sql,params,callback){
	
	db.getConnection(function(err, connection) {
		
		if(typeof params=='function'){
		  callback=params;	
		  params=[];	
		}
		
		db.query(sql,params,function(err, rows, fields) {
		 if (err) throw err;
		 
		 if(typeof callback=='function')
		   callback(rows);
		   
		});
		connection.release();
	});
			
	}
	

var Auth=function(){
	
	
	function insertNewDevice(user_id,uuid,platform,version,device_name){
			
		data={USER_ID:user_id,UUID:uuid,PLATFORM:platform,VERSION:version,NAME:device_name};
		makeQuery('insert into  users_devices set ?',data)
	
	}
	
	function checkDevice(user_id,uuid,callback){
			
		makeQuery('SELECT * FROM users_devices WHERE USER_ID=? and UUID =? ',[user_id,uuid],function(rows){
												if(rows.length > 0)
													 callback(rows[0]); 
												else
													callback(null);
		});
			
			
		
	
	}
	
	function is_profile_complete(staff_id,callback){
		
		makeQuery('SELECT * FROM staff WHERE STAFF_ID =? ',[staff_id],function(rows) {
			
				if(rows.length > 0 
				  && rows[0].BIRTH_DATE!='' 
				  && rows[0].COUNTRY_NO!=''
				  && rows[0].MOBILE!='' 
				  && rows[0].NATIONAL_NO!=''
				  && rows[0].SECTION_NO!=''){
				    callback(true);
				  	 return true; 
				}
				callback(false);
		  });
		
		
	}
	
	
	return {
		
		login:function(data,callback){
			
			username=data.username;
			password=data.password;
			uuid=data.uuid;
			platform=data.platform;
			version=data.version;
			device_name=data.device_name;
			
			makeQuery('SELECT id,username,email,active,fullname,password,STAFF_ID FROM users WHERE username =?',[username],function(rows) {
				 
				 
					if(rows==0){ //invalid username
						callback({"error":1});
						return;
					}/*
					if(bcrypt.compareSync(password, rows[0].password)){ //invalid password
						
						socket.emit("login",{"error":2});
						return;
							
					}*/
					if(rows[0].active==0){ //not active
						callback({"error":3});
						return;
					}
					
					if(rows[0].STAFF_ID==null || parseInt(rows[0].STAFF_ID)==0){ // not assigned to staff
							
						callback({"error":4});
						return;
						
					}
								
					
					checkDevice(rows[0].id,uuid,function(result){
						
					 if(result==null){ //device not exists
							
							insertNewDevice(rows[0].id,uuid,platform,version,device_name);
							callback({"error":5});
							return;
					}
					if(result.ACTIVE==0){  //device not active
								
								callback({"error":6});
								return;
								
				     }
					  // the user is active and the device is active
					
					delete rows[0]['password'];
					delete rows[0]['active'];
									
					is_profile_complete(rows[0].STAFF_ID,function(completed){
						
						rows[0].profileNotComplete=completed;
						rows[0]['rooms']=[];
						rows[0]['logged']=true;
						
						makeQuery('SELECT users_groups.group_id,groups.name from users_groups,groups where users_groups.group_id=groups.id and user_id=?',[rows[0].id],function(groups) {
							
								for(var i=0;i<groups.length;i++){
									 rows[0]['rooms'].push({"id":groups[i].group_id,"name":groups[i].name});
									 //rooms[groups[i].group_id].addPerson(rows[0].id);
								}
								
								callback(rows[0]);
								
								
						
						});
						
						
						
						
					})
								
									
								
					    
					 
					 
					 
					 
					 
					 }); 
						
						
					
						
					
					
					
				  
				  
				});
				
				
			
			
			
			
		},
		
		register:function(socket,data){
			
			makeQuery('insert into  users set ?',data,function(){
				 	socket.emit("register",{"msg":7});
					return 
			});
				
		},
		
		
		
			
	}
		
}();





//

/*
var router=require('socket.io-events')();
router.on('*', function (socket, args, next) { 
console.log("i recieved"+args[0]+" and logged=:"+io.sockets.socket(socket.id).logged);
if(args[0]!="login" &&  args[0]!="register" &&  args[0]!="forgot_password" && !socket.logged){
		
		//socket.emit("sender", data);
		socket.emit("custome_error",{"msg":'you are not logged'});
		return;
}

next();
});



//router.on(/.+/, function (socket, args, next) {});
//router.on('login', function (socket, args, next) {});
*/




function createRooms(){
makeQuery("select * from groups",function(rows){
		
		for(var i=0;i<rows.length;i++){
			//var room = new Room(rows[i]);
			//rooms[rows[i].id] = room;
			rooms[rows[i].id] = rows[i];
			console.log("create room # "+rows[i].id+" name:"+rows[i].name);
		}
	})}

createRooms();

io.sockets.on('connection', function (socket) {
    
	Allsockets[socket.id] = {"logged":false,"user":false,rooms:[]};
	
	socket.userData={"logged":false,"user":false,rooms:[]};
	
	function isLogin(){
		
		if(Allsockets[socket.id].logged==true)
		 return true;
		
		socket.emit("custome_error",{"msg":'you are not logged'});
		//socket.disconnect('unauthorized');
		return false;
		
			
	}
	function logout(){
		
		if(typeof Allsockets[socket.id]=='undefined')
			 return;
			
			for(var i=0;i<socket.userData.rooms.length;i++){
				
				socket.leave(socket.userData.rooms[i]['id']);
				socket.broadcast.to(socket.userData.rooms[i]['id']).emit('userLogout',socket.userData.id);
				console.log("user "+socket.userData.fullname+" has left the room #"+socket.userData.rooms[i]['id']);
				
			}
			
			delete Allsockets[socket.id];
			
			socket.disconnect();
			
	 }
	 
	 
	 
	socket.on("login", function (data) {
		Auth.login(data,function(result){
			
			if(socket.userData.logged==true)
			 return;
			 
			if("error" in result){
				
				socket.emit("login",{"error":result.error});
				
			}else{
				
				console.log(result.fullname+" logged in");
				
				Allsockets[socket.id]=result;
				socket.userData=result;
				
				Clients[result.id]=socket.id;
				
				for(var i=0;i< result.rooms.length;i++){
					socket.join(result.rooms[i]['id']);
					console.log(result.fullname+"has joined the room#"+result.rooms[i]['id']);
					socket.broadcast.to(result.rooms[i]['id']).emit('userLogin',result.id);	
				}
				
				socket.emit("login",result);
				
			}
			
		})
	});
	
	socket.on("register", function (data) {Auth.regsiter(data);});
	
	
	socket.on("departments", function (data) {
		
		makeQuery("select * from sections",function(rows){
			
			var r=[];
			for(var i=0;i<rows.length;i++){
				r.push({"id":rows[i].SECTION_NO,"title":rows[i].SECTION_DESC});	
			}			
			
			socket.emit("departments",r);
			
				
		});
			
	});
	socket.on("news", function (data) {
		
		makeQuery("select * from news where NOW() between START_DATE and END_DATE  ",function(rows){
			
			var r=[];
			for(var i=0;i<rows.length;i++){
				r.push({"id":rows[i].ID,"title":rows[i].TITLE_EN,"date":rows[i].CREATED_DATE});	
			}			
			socket.emit("news",r);
			
				
		});
			
	});
	
	socket.on("rooms", function () {
		
		socket.emit("getMyRooms", socket.userData.rooms);
		
	});
	socket.on("contacts", function () {
		
		var groups=[],contacts=[];
		
		for(var i=0;i<socket.rooms.length;i++){
			groups.push(socket.rooms[i]['id']);
		}
		
		
		makeQuery("select users.* from users,users_groups where users.id=users_groups.user_id and group_id in (?) and user_id!=? ",[groups.join(),socket.userData.id],function(rows){
			
			var r=[];
			
			for(var i=0;i<rows.length;i++){
				
				contacts.push({"id":rows[i].id,"fullname":rows[i].fullname,"online":(rows[i].id in Clients)});	
			
			}			
			
			socket.emit("contacts", contacts);
			
		});
			
	
		
		
		
	});
	socket.on("favorites", function () {
		
		var favorites=[];
		
		makeQuery("select contact_id from users_favorites where users_id=?",[socket.userData.id],function(rows){
			for(var i=0;i<rows.length;i++){
				
				favorites.push({"id":rows[i].id,"online":(rows[i].id in Clients)});	
			
			}			
			socket.emit("favorites", favorites);
		});
	});
	
	
	
	
	
	
	socket.on("send", function (id,msg,to_room) {
		
		if(socket.userData.rooms.length==0){ // the user is not logged in any room
		 return;
		}
		
		if(typeof to_room=='undefined'){ 
		/***
		*
		*	this message for a user , 
		*	so get the socket id corresponding to this user		*
		*/
			//console.log(Clients[id]);
			if(id in Clients){
				console.log("broadcast the msg to the user#"+id+" which his room id is "+Clients[id]);
				socket.broadcast.to(Clients[id]).emit('serverMsg',{name:socket.userData.fullname,msg:msg});
			
			}else{ // offline message , store it to database
				
				console.log("offline");
			
			}
			
		}else{ // for rooms
			
			
			if(id in socket.userData.rooms){ // send only if the user is joined in this room
				console.log("broadcast the msg to the room#"+id);
				socket.broadcast.to(id).emit('serverMsg',{name:socket.userData.fullname,msg:msg});
			}
				
		}
		
			
	});
	
	
	socket.on("typing", function (id,to_room) {
       // the user is not logged in any room
		if(socket.userData.rooms.length==0){ 
		 return;
		}
		/***
		*
		*	this message for a user , 
		*	so get the socket id corresponding to this user		*
		*/
		if(typeof to_room=='undefined'){ 
			if(id in Clients)
				socket.broadcast.to(Clients[id]).emit('typing',socket.userData.id);
		}else{ // for rooms
			// send only if the user is joined in this room
			if(id in socket.userData.rooms) 
				socket.broadcast.to(id).emit('typing',socket.userData.id);
		}
		
    });
	socket.on("logout", function (data) {logout();});
	socket.on('disconnect', function () {logout();});
  	
	
	ss(socket).on('profile-image', function(stream, data) {
		var filename = path.basename(data.name);
		stream.pipe(fs.createWriteStream(filename));
  	});
  
	
	
	
	
	
	
});