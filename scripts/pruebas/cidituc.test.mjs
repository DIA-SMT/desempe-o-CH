// Pruebas del ingreso con CiDiTuc (src/lib/cidituc.ts). Uso: npm run pruebas
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import {
  dniDeDocumento, firmar, leerConfig, mismoValor, nombresCoinciden, nuevoState, urlDeIngreso, validarToken, venceEn, verificar,
} from '../../src/lib/cidituc.ts';

const SECRETO = 'x'.repeat(40);
const ENV = {
  CIDITUC_LOGIN_URL: 'https://ciudaddigital.smt.gob.ar/#/',
  CIDITUC_BACKEND_URL: 'https://estadisticas.smt.gob.ar:5000/',
  CIDITUC_NEXT_KEY: 'evaluacion-desempeno',
  CIDITUC_SESSION_SECRET: SECRETO,
};

describe('configuración', () => {
  test('completa: saca barras y # del final', () => {
    const c = leerConfig(ENV);
    assert.equal(c.loginUrl, 'https://ciudaddigital.smt.gob.ar');
    assert.equal(c.backendUrl, 'https://estadisticas.smt.gob.ar:5000');
  });
  test('sin alguna variable o con un secreto corto, no hay ingreso', () => {
    assert.equal(leerConfig({ ...ENV, CIDITUC_NEXT_KEY: '' }), null);
    assert.equal(leerConfig({ ...ENV, CIDITUC_SESSION_SECRET: 'corto' }), null);
  });
  test('la dirección de ingreso lleva el # de Ciudad Digital, la clave y el state', () => {
    const url = urlDeIngreso(leerConfig(ENV), 'abc_123');
    assert.equal(url, 'https://ciudaddigital.smt.gob.ar/#/login?next=evaluacion-desempeno&state=abc_123');
  });
});

describe('state', () => {
  test('es largo, al azar y distinto cada vez', () => {
    const a = nuevoState(), b = nuevoState();
    assert.ok(a.length >= 43);
    assert.notEqual(a, b);
  });
  test('se compara exacto y un valor vacío nunca coincide', () => {
    assert.equal(mismoValor('abc', 'abc'), true);
    assert.equal(mismoValor('abc', 'abd'), false);
    assert.equal(mismoValor('abc', 'abcd'), false);
    assert.equal(mismoValor('', ''), false);
    assert.equal(mismoValor(undefined, undefined), false);
  });
});

describe('CUIL a DNI', () => {
  test('saca el prefijo, el verificador y los ceros adelante', () => {
    assert.equal(dniDeDocumento('20012345673'), '1234567');
    assert.equal(dniDeDocumento('27-30123456-4'), '30123456');
    assert.equal(dniDeDocumento(20301234564), '30123456');
  });
  test('acepta un DNI suelto y rechaza lo que no es documento', () => {
    assert.equal(dniDeDocumento('30123456'), '30123456');
    assert.equal(dniDeDocumento('123'), null);
    assert.equal(dniDeDocumento(''), null);
    assert.equal(dniDeDocumento(null), null);
  });
});

describe('cookies firmadas', () => {
  test('vuelven intactas con el mismo secreto', () => {
    const v = firmar({ dni: '30123456', exp: venceEn(60) }, SECRETO);
    assert.equal(verificar(v, SECRETO)?.dni, '30123456');
  });
  test('no sirven retocadas, con otro secreto o vencidas', () => {
    const v = firmar({ dni: '30123456', exp: venceEn(60) }, SECRETO);
    const [cuerpo, firma] = v.split('.');
    const otro = Buffer.from(JSON.stringify({ dni: '99999999', exp: venceEn(60) })).toString('base64url');
    assert.equal(verificar(`${otro}.${firma}`, SECRETO), null);
    assert.equal(verificar(`${cuerpo}.${firma}x`, SECRETO), null);
    assert.equal(verificar(v, 'y'.repeat(40)), null);
    assert.equal(verificar(firmar({ dni: '1', exp: venceEn(-1) }, SECRETO), SECRETO), null);
    assert.equal(verificar(undefined, SECRETO), null);
  });
});

describe('nombre de CiDiTuc contra el padrón', () => {
  test('coincide con un apellido y un nombre, sin importar tildes, orden ni los que falten en el padrón', () => {
    assert.ok(nombresCoinciden({ nombre: 'Matías Ignacio', apellido: 'Luján Weisheim' }, 'LUJAN WEISHEIM MATIAS IGNACIO'));
    assert.ok(nombresCoinciden({ nombre: 'Luciano Martín', apellido: 'Bonilla' }, 'BONILLA LUCIANO'));
    assert.ok(nombresCoinciden({ nombre: 'María', apellido: 'de la Fuente' }, 'FUENTE MARIA JOSE'));
    assert.ok(nombresCoinciden({ nombre: 'Marco', apellido: 'Rossi Gómez' }, 'ROSSI MARCO'));
  });
  test('no coincide si no hay ningún apellido o ningún nombre en común, o si viene vacío', () => {
    assert.equal(nombresCoinciden({ nombre: 'Matías', apellido: 'Pérez' }, 'LUJAN WEISHEIM MATIAS'), false);
    assert.equal(nombresCoinciden({ nombre: 'Juan', apellido: 'Bonilla' }, 'BONILLA LUCIANO'), false);
    assert.equal(nombresCoinciden({ nombre: 'Luciano', apellido: 'Luciano' }, 'BONILLA LUCIANO'), false);
    assert.equal(nombresCoinciden({ nombre: '', apellido: 'Bonilla' }, 'BONILLA LUCIANO'), false);
  });
});

describe('validación contra authStatus', () => {
  let servidor, base, ultimo;
  const respuestas = {
    '/ok/usuarios/authStatus': [200, { usuarioSinContraseña: { documento_persona: 20301234564, nombre_persona: 'Ana', apellido_persona: 'Paz' } }],
    '/anidado/usuarios/authStatus': [200, { data: { usuarioSinContraseña: { documento_persona: '27301234564', nombre_persona: 'Ana', apellido_persona: 'Paz' } } }],
    '/vencido/usuarios/authStatus': [401, { error: 'token' }],
    '/raro/usuarios/authStatus': [200, { otra: 'cosa' }],
  };
  before(async () => {
    servidor = createServer((req, res) => {
      ultimo = req.headers.authorization;
      const [status, cuerpo] = respuestas[req.url] ?? [404, {}];
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(cuerpo));
    });
    await new Promise((r) => servidor.listen(0, r));
    base = `http://127.0.0.1:${servidor.address().port}`;
  });
  after(() => servidor.close());
  const config = (ruta) => ({ ...leerConfig(ENV), backendUrl: `${base}/${ruta}` });

  test('con 200 devuelve la persona y manda el token crudo, sin "Bearer"', async () => {
    const v = await validarToken(config('ok'), 'jwt-de-prueba');
    assert.deepEqual(v, { ok: true, persona: { documento: '20301234564', nombre: 'Ana', apellido: 'Paz' } });
    assert.equal(ultimo, 'jwt-de-prueba');
  });
  test('encuentra a la persona aunque venga dentro de data', async () => {
    assert.equal((await validarToken(config('anidado'), 't')).ok, true);
  });
  test('token rechazado o respuesta sin persona: motivo token', async () => {
    assert.deepEqual(await validarToken(config('vencido'), 't'), { ok: false, motivo: 'token' });
    assert.deepEqual(await validarToken(config('raro'), 't'), { ok: false, motivo: 'token' });
  });
  test('sin conexión: motivo red', async () => {
    assert.deepEqual(await validarToken({ ...config('ok'), backendUrl: 'http://127.0.0.1:1' }, 't'), { ok: false, motivo: 'red' });
  });
});
