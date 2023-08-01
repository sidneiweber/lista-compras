//use path module
const path = require('path');
//use express module
const express = require('express');
const fileUpload = require('express-fileupload');
//use hbs view engine
const hbs = require('hbs');
//use bodyParser middleware
const bodyParser = require('body-parser');
//use mysql database
const mysql = require('mysql');
// DATADOG
//const tracer = require('dd-trace').init();
const app = express();
var port = process.env.PORT || 5000;

//Create Connection
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl: true,
  database: process.env.DB_DATABASE
});

//connect to database
conn.connect((err) =>{
  if(err) throw err;
  console.log('Mysql Connected...');
});

//set views file
app.set('views',path.join(__dirname,'views'));
//set view engine
app.set('view engine', 'hbs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
//set folder public as static folder for static file
app.use('/assets',express.static(__dirname + '/public'));
app.use(fileUpload());

//route for homepage
app.get('/produtos',(req, res) => {
  let sql = "SELECT * FROM estoque ORDER BY produto,descricao";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
    res.render('product_view',{
      results: results
    });
  });
});

//route for estoque
app.get('/',(req, res) => {
  //console.log(c)
  let sql = "SELECT * FROM estoque WHERE estoque <= 0 ORDER BY produto,descricao";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
    res.render('estoque',{
      results: results
    });
  });
});

//route search
app.post('/search/',(req, res) => {
  var string = req.body.busca.split(" ");
  var palavra = ("+" + string.join('* +'));
  //console.log(palavra)
  //let data = req.body.busca;
  let sql = "SELECT * FROM estoque WHERE produto LIKE '"+req.body.busca+"%' ORDER BY produto,descricao";
  let query = conn.query(sql, palavra,(err, results) => {
    if(err) throw err;
    res.render('product_view',{
      results: results
    });
  });
});

//route for insert product
app.post('/produto/save', (req, res) => {
  if ( req.files !== null )
  {
    var file = req.files.product_foto;
    var img_name=file.name;
    file.mv('./public/fotos/'+img_name, function(err) {
      if (err)
        return res.status(500).send(err);
    });
    let data = {produto: req.body.product_produto, estoque: req.body.product_estoque, categoria: req.body.product_categoria, foto: img_name};
    let sql = "INSERT INTO estoque SET ?";
    let query = conn.query(sql, data,(err, results) => {
      if(err) throw err;
      res.redirect('/');
    });
  }else{
    let data = {produto: req.body.product_produto, estoque: req.body.product_estoque, categoria: req.body.product_categoria};
    let sql = "INSERT INTO estoque SET ?";
    let query = conn.query(sql, data,(err, results) => {
      if(err) throw err;
      res.redirect('/');
    });
  }
});

//route for update data
app.post('/produto/update',(req, res) => {
  if ( req.files !== null )
  {
    var file = req.files.product_foto;
    var img_name=file.name;
    file.mv('./public/fotos/'+img_name, function(err) {
      if (err)
        return res.status(500).send(err);
    });
    let sql = "UPDATE estoque SET foto='"+img_name+"', produto='"+req.body.product_produto+"', estoque='"+req.body.product_estoque+"', categoria='"+req.body.product_categoria+"' WHERE id="+req.body.id;
    let query = conn.query(sql, (err, results) => {
      if(err) throw err;
      res.redirect('/');
    });
  }
  else
  {
  let sql = "UPDATE estoque SET produto='"+req.body.product_produto+"', estoque='"+req.body.product_estoque+"', categoria='"+req.body.product_categoria+"' WHERE id="+req.body.id;
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
  res.redirect('/');
  });
  }
});

app.post('/produto/add',(req, res) => {
  let sql = "UPDATE estoque SET estoque='"+req.body.product_quantidade+"' WHERE id="+req.body.id;
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
    res.redirect('/');
  });
});

//route for zero stock
app.post('/produto/remove',(req, res) => {
  let sql = "UPDATE estoque SET estoque='0' WHERE id="+req.body.product_id;
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
      res.redirect('/');
  });
});

//route for delete data
app.post('/delete',(req, res) => {
  let sql = "DELETE FROM estoque WHERE id="+req.body.product_id+" LIMIT 1";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
      res.redirect('/');
  });
});

//server listening
app.listen(port, () => {
  console.log('Server is running at port: ' + port);
});
