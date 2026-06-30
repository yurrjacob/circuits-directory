/* ===== Circuits.com — demo listings data =====
   Maps a search keyword to a premium (sponsored) listing + a list of companies.
   This is front-end demo data only. */

const LOGO_COLORS = ['#76c000','#0f6fff','#ff7a00','#9b51e0','#e02d5b','#00a8a8','#444b54','#c9a400'];

function makeCompanies(list){
  return list.map((c,i)=>({
    color: LOGO_COLORS[i % LOGO_COLORS.length],
    ...c
  }));
}

const KEYWORDS = {
  circuits: {
    premium: {
      name:'Northbridge Components',
      url:'https://www.northbridgecomponents.com',
      blurb:'Authorized distributor of analog, power & logic ICs. 2M+ parts in stock, same-day shipping.',
      contact:'Maria Vance', phone:'(415) 555-0142', email:'sales@northbridge.com'
    },
    companies: makeCompanies([
      {name:'Apex Semiconductor Supply', url:'https://www.apexsemi.com', contact:'David Cho', phone:'(408) 555-0178', email:'orders@apexsemi.com', badge:'Verified'},
      {name:'Lumen Circuit Co.', url:'https://www.lumencircuit.com', contact:'Priya Nair', phone:'(512) 555-0193', email:'sales@lumencircuit.com', badge:'Trusted'},
      {name:'Vertex Electronics', url:'https://www.vertexelectronics.com', contact:'Tom Becker', phone:'(617) 555-0110', email:'quotes@vertexelec.com', badge:'Authorized'},
      {name:'Cascade IC Distributors', url:'https://www.cascadeic.com', contact:'Hannah Liu', phone:'(206) 555-0125', email:'info@cascadeic.com'},
      {name:'Ironwood Components Group', url:'https://www.ironwoodcomp.com', contact:'Marcus Reed', phone:'(312) 555-0166', email:'sales@ironwoodcomp.com', badge:'Top Rated'},
      {name:'Solis Microelectronics', url:'https://www.solismicro.com', contact:'Elena Ruiz', phone:'(602) 555-0188', email:'orders@solismicro.com'},
      {name:'Brightline Parts', url:'https://www.brightlineparts.com', contact:'Owen Patel', phone:'(919) 555-0144', email:'hello@brightlineparts.com'},
      {name:'Granite State Semi', url:'https://www.granitestatesemi.com', contact:'Karen Doyle', phone:'(603) 555-0171', email:'sales@gssemi.com'}
    ])
  },

  microcontrollers: {
    premium:{name:'CoreLogic Devices', url:'https://www.corelogicdevices.com', blurb:'MCUs & MPUs from every major fab. Dev boards, programming services, lifetime buy support.', contact:'Sanjay Mehta', phone:'(669) 555-0150', email:'mcu@corelogic.com'},
    companies: makeCompanies([
      {name:'PicoStack Systems', url:'https://www.picostack.com', contact:'Rachel Kim', phone:'(408) 555-0211', email:'sales@picostack.com'},
      {name:'EmbedTech Supply', url:'https://www.embedtechsupply.com', contact:'Luis Romero', phone:'(214) 555-0233', email:'orders@embedtech.com'},
      {name:'Northgate Microsystems', url:'https://www.northgatemicro.com', contact:'Amy Foster', phone:'(503) 555-0245', email:'info@northgatemicro.com'},
      {name:'Helix Processor Co.', url:'https://www.helixprocessor.com', contact:'Devon Wright', phone:'(781) 555-0260', email:'sales@helixproc.com'},
      {name:'Quantum Edge Components', url:'https://www.quantumedge.com', contact:'Nadia Hassan', phone:'(305) 555-0277', email:'quotes@quantumedge.com'}
    ])
  },

  pmic: {
    premium:{name:'VoltWise Power', url:'https://www.voltwisepower.com', blurb:'PMICs, LDOs, DC-DC converters & battery management. Reference designs included.', contact:'Greg Salinas', phone:'(480) 555-0301', email:'power@voltwise.com'},
    companies: makeCompanies([
      {name:'AmpereOne Distribution', url:'https://www.ampereone.com', contact:'Tara Singh', phone:'(408) 555-0312', email:'sales@ampereone.com'},
      {name:'Meridian Power Systems', url:'https://www.meridianpower.com', contact:'Chris Vogel', phone:'(216) 555-0327', email:'orders@meridianpower.com'},
      {name:'BlueRail Energy IC', url:'https://www.bluerailenergy.com', contact:'Joy Adeyemi', phone:'(404) 555-0339', email:'info@bluerailenergy.com'},
      {name:'Sentinel Regulators', url:'https://www.sentinelreg.com', contact:'Pavel Novak', phone:'(412) 555-0350', email:'sales@sentinelreg.com'}
    ])
  },

  sensors: {
    premium:{name:'SenseGrid Technologies', url:'https://www.sensegrid.com', blurb:'MEMS, optical, temperature & current sensors. Calibration & sample kits available.', contact:'Mei Tanaka', phone:'(858) 555-0410', email:'sensors@sensegrid.com'},
    companies: makeCompanies([
      {name:'Aperture Sensing', url:'https://www.aperturesensing.com', contact:'Ben Carter', phone:'(503) 555-0421', email:'sales@aperturesensing.com'},
      {name:'TrueNorth Detect', url:'https://www.truenorthdetect.com', contact:'Olivia Brooks', phone:'(720) 555-0433', email:'orders@truenorthdetect.com'},
      {name:'PhotonWorks Supply', url:'https://www.photonworks.com', contact:'Raj Malhotra', phone:'(469) 555-0448', email:'info@photonworks.com'},
      {name:'Cardinal MEMS', url:'https://www.cardinalmems.com', contact:'Grace Olsen', phone:'(651) 555-0455', email:'sales@cardinalmems.com'}
    ])
  }
};

/* Aliases so common searches land on a dataset */
const ALIASES = {
  circuit:'circuits', ics:'circuits', ic:'circuits', 'integrated circuits':'circuits', chips:'circuits', chip:'circuits',
  semiconductors:'circuits', semiconductor:'circuits', semis:'circuits',
  'semi-conductors':'circuits', 'semi-conductor':'circuits',
  microcontroller:'microcontrollers', mcu:'microcontrollers', mcus:'microcontrollers', processor:'microcontrollers', processors:'microcontrollers',
  pmics:'pmic', 'power management':'pmic', power:'pmic', regulators:'pmic', 'power management ics':'pmic',
  sensor:'sensors', mems:'sensors'
};

/* For any unknown keyword, generate plausible listings so every search returns results. */
function generateFor(keyword){
  const cap = keyword.replace(/\b\w/g,m=>m.toUpperCase());
  const stems = ['Apex','Lumen','Vertex','Cascade','Ironwood','Solis','Brightline','Meridian','Sentinel','Northgate'];
  const tails = ['Components','Supply','Distribution','Electronics','Systems','IC Group','Technologies','Devices'];
  const firsts = ['David Cho','Priya Nair','Tom Becker','Hannah Liu','Marcus Reed','Elena Ruiz','Owen Patel','Karen Doyle'];
  const companies = stems.slice(0,6).map((s,i)=>{
    const slug = (s+tails[i%tails.length]).toLowerCase().replace(/[^a-z]/g,'');
    return {
      color: LOGO_COLORS[i % LOGO_COLORS.length],
      name: `${s} ${tails[i%tails.length]}`,
      url: `https://www.${slug}.com`,
      contact: firsts[i % firsts.length],
      phone: `(${200+i*37%700}) 555-0${100+i*13}`,
      email: `sales@${slug}.com`
    };
  });
  return {
    premium:{
      name:`${cap} Pro Supply`,
      url:`https://www.${keyword.replace(/[^a-z0-9]/gi,'')}prosupply.com`,
      blurb:`Specialist distributor for ${cap}. Bulk pricing, datasheets & lead-time guarantees.`,
      contact:'Sales Team', phone:'(800) 555-0100', email:`sales@${keyword.replace(/[^a-z0-9]/gi,'')}pro.com`
    },
    companies
  };
}

function lookupKeyword(raw){
  const k = (raw||'').trim().toLowerCase();
  if(!k) return null;
  if(KEYWORDS[k]) return {key:k, ...KEYWORDS[k]};
  if(ALIASES[k] && KEYWORDS[ALIASES[k]]) return {key:k, ...KEYWORDS[ALIASES[k]]};
  return {key:k, ...generateFor(k)};
}
