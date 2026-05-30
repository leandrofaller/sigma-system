require('ts-node').register({
  compilerOptions: {
    module: 'commonjs'
  }
});
require('./test-scrape-single-historico.ts');
