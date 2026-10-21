'use strict';
const {PGlite}=require('@electric-sql/pglite');
async function createPool(){
  const db=await PGlite.create();let tail=Promise.resolve();
  async function acquire(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;return release;}
  async function query(sql,params){if(!params&&sql.includes(';')){const results=await db.exec(sql);return results.at(-1)||{rows:[]};}return db.query(sql,params);}
  return {
    async query(sql,params){const release=await acquire();try{return await query(sql,params);}finally{release();}},
    async connect(){const release=await acquire();return{query,release};},
    async end(){await tail;await db.close();},
  };
}
module.exports={createPool};
