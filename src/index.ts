import path from 'path';
import express, { Request, Response } from 'express';
import fileUpload, { UploadedFile } from 'express-fileupload';
import hbs from 'hbs';
import bodyParser from 'body-parser';
import mysql, { MysqlError } from 'mysql';

const app = express();
const port = process.env.PORT || 5000;

// Configuração de conexão com fallback para ambiente local
const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASS || 'bolacha';
const dbName = process.env.DB_DATABASE || 'estoque';

// Garante que a tabela `estoque` exista ao subir a aplicação
const ensureSchema = (conn: mysql.Connection) => {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS estoque (
      foto VARCHAR(255),
      produto VARCHAR(255),
      descricao VARCHAR(255),
      categoria VARCHAR(255),
      estoque VARCHAR(255),
      id INT(11) NOT NULL AUTO_INCREMENT,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  conn.query(createTableSql, (err) => {
    if (err) {
      console.error('Erro ao garantir tabela "estoque":', err);
      throw err;
    }
    console.log('Tabela "estoque" verificada/criada com sucesso.');
  });
};

// Cria o database (schema) se não existir e depois conecta na base certa
const initDatabase = () => {
  // conexão inicial sem database para garantir o CREATE DATABASE
  const bootstrapConn = mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword
    //ssl: process.env.DB_HOST ? true : false
  });

  bootstrapConn.connect((err?: MysqlError) => {
    if (err) {
      console.error('Erro ao conectar no MySQL para criar database:', err);
      throw err;
    }

    const createDbSql = `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
    bootstrapConn.query(createDbSql, (createErr) => {
      if (createErr) {
        console.error('Erro ao criar/verificar database:', createErr);
        throw createErr;
      }
      console.log(`Database "${dbName}" verificado/criado com sucesso.`);
      bootstrapConn.end();

      // Agora sim, conexão principal já apontando para o database
      const mainConn = mysql.createConnection({
        host: dbHost,
        user: dbUser,
        password: dbPassword,
        database: dbName
        //ssl: process.env.DB_HOST ? true : false
      });

      mainConn.connect((errMain?: MysqlError) => {
        if (errMain) {
          console.error('Erro ao conectar no MySQL (conexão principal):', errMain);
          throw errMain;
        }
        console.log('Mysql Connected...');
        ensureSchema(mainConn);

        // A partir daqui, usamos essa conexão global
        (global as any).dbConn = mainConn;
      });
    });
  });
};

// Inicializa database e conexões
initDatabase();

// View engine and middlewares
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'hbs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/assets', express.static(path.join(__dirname, '..', 'public')));
app.use(fileUpload());

// Types auxiliares
interface EstoqueRow {
  id: number;
  produto: string;
  descricao?: string;
  categoria?: string;
  estoque: number;
  foto?: string;
}

interface CategoriaRow {
  categoria: string | null;
}

interface ProdutoBody {
  id?: string;
  product_id?: string;
  product_produto?: string;
  product_categoria?: string;
  product_estoque?: string;
  product_quantidade?: string;
}

// Helpers de template
hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);

// Rotas
const getConn = (): mysql.Connection => {
  return (global as any).dbConn as mysql.Connection;
};

app.get('/produtos', (_req: Request, res: Response) => {
  const sql = 'SELECT * FROM estoque ORDER BY produto,descricao';
  getConn().query(sql, (err, results: EstoqueRow[]) => {
    if (err) throw err;
    res.render('product_view', { results });
  });
});

app.get('/', (_req: Request, res: Response) => {
  const sql = 'SELECT * FROM estoque WHERE estoque <= 0 ORDER BY produto,descricao';
  getConn().query(sql, (err, results: EstoqueRow[]) => {
    if (err) throw err;
    res.render('estoque', { results });
  });
});

// Modo lista de compras para usar no mercado (checklist)
app.get(
  '/compras',
  (req: Request<unknown, unknown, unknown, { categoria?: string; busca?: string }>, res: Response) => {
    const categoria = req.query.categoria || '';
    const busca = req.query.busca || '';

    // Busca categorias disponíveis
    const sqlCategorias =
      'SELECT DISTINCT categoria FROM estoque WHERE categoria IS NOT NULL AND categoria <> "" ORDER BY categoria';

    getConn().query(sqlCategorias, (errCat, catResults: CategoriaRow[]) => {
      if (errCat) throw errCat;

      const categorias = catResults.map((row) => row.categoria).filter((c): c is string => !!c);

      // Monta query de produtos em falta com filtros opcionais
      let sqlProdutos = 'SELECT * FROM estoque WHERE estoque <= 0';
      const params: Array<string> = [];

      if (categoria) {
        sqlProdutos += ' AND categoria = ?';
        params.push(categoria);
      }

      if (busca) {
        sqlProdutos += ' AND produto LIKE ?';
        params.push(`${busca}%`);
      }

      sqlProdutos += ' ORDER BY produto,descricao';

      getConn().query(sqlProdutos, params, (errProd, results: EstoqueRow[]) => {
        if (errProd) throw errProd;
        res.render('compras', {
          results,
          categorias,
          filtroCategoria: categoria,
          filtroBusca: busca
        });
      });
    });
  }
);

app.post('/search', (req: Request<unknown, unknown, { busca?: string }>, res: Response) => {
  const busca = req.body.busca || '';
  const sql = "SELECT * FROM estoque WHERE produto LIKE ? ORDER BY produto,descricao";
  getConn().query(sql, [`${busca}%`], (err, results: EstoqueRow[]) => {
    if (err) throw err;
    res.render('product_view', { results });
  });
});

app.post('/produto/save', (req: Request<unknown, unknown, ProdutoBody>, res: Response) => {
  const files = req.files as { [fieldname: string]: UploadedFile } | undefined;
  let imgName: string | undefined;

  if (files && files.product_foto) {
    const file = files.product_foto;
    imgName = file.name;
    file.mv(path.join(__dirname, '..', 'public', 'fotos', imgName), (err) => {
      if (err) return res.status(500).send(err);
    });
  }

  const data = {
    produto: req.body.product_produto,
    estoque: req.body.product_estoque,
    categoria: req.body.product_categoria,
    ...(imgName ? { foto: imgName } : {})
  };

  const sql = 'INSERT INTO estoque SET ?';
  getConn().query(sql, data, (err) => {
    if (err) throw err;
    res.redirect('/');
  });
});

app.post('/produto/update', (req: Request<unknown, unknown, ProdutoBody>, res: Response) => {
  const { id, product_produto, product_estoque, product_categoria } = req.body;
  if (!id) return res.status(400).send('ID obrigatório');

  const files = req.files as { [fieldname: string]: UploadedFile } | undefined;

  let sql: string;
  const params: Array<string | number> = [
    product_produto || '',
    product_estoque || '0',
    product_categoria || ''
  ];

  if (files && files.product_foto) {
    const file = files.product_foto;
    const imgName = file.name;
    file.mv(path.join(__dirname, '..', 'public', 'fotos', imgName), (err) => {
      if (err) return res.status(500).send(err);
    });
    sql = 'UPDATE estoque SET foto=?, produto=?, estoque=?, categoria=? WHERE id=?';
    params.unshift(imgName);
  } else {
    sql = 'UPDATE estoque SET produto=?, estoque=?, categoria=? WHERE id=?';
  }

  params.push(Number(id));

  getConn().query(sql, params, (err) => {
    if (err) throw err;
    res.redirect('/');
  });
});

app.post('/produto/add', (req: Request<unknown, unknown, ProdutoBody>, res: Response) => {
  const { id, product_quantidade } = req.body;
  if (!id) return res.status(400).send('ID obrigatório');

  const sql = 'UPDATE estoque SET estoque=? WHERE id=?';
  getConn().query(sql, [product_quantidade || 0, Number(id)], (err) => {
    if (err) throw err;
    res.redirect('/');
  });
});

app.post('/produto/remove', (req: Request<unknown, unknown, ProdutoBody>, res: Response) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).send('ID obrigatório');

  const sql = "UPDATE estoque SET estoque='0' WHERE id=?";
  getConn().query(sql, [Number(product_id)], (err) => {
    if (err) throw err;
    res.redirect('/');
  });
});

app.post('/delete', (req: Request<unknown, unknown, ProdutoBody>, res: Response) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).send('ID obrigatório');

  const sql = 'DELETE FROM estoque WHERE id=? LIMIT 1';
  getConn().query(sql, [Number(product_id)], (err) => {
    if (err) throw err;
    res.redirect('/');
  });
});

app.listen(port, () => {
  console.log(`Server is running at port: ${port}`);
});


