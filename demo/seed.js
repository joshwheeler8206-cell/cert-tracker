/* auto-generated demo seed for cert-tracker */
var __SEED_DBS__ = {
"usaf_cert_tracker_db": {
"key": "usaf_cert_tracker_v1",
"value": [
{
"id": "d1",
"name": "Marcus Reed",
"driverId": "DRV-1024",
"certs": [
{
"id": "c1",
"label": "CDL Class A",
"expiry": "2027-05-14",
"notes": ""
},
{
"id": "c2",
"label": "Medical Card",
"expiry": "2027-01-30",
"notes": ""
},
{
"id": "c3",
"label": "Hazmat Endorsement",
"expiry": "2026-11-02",
"notes": ""
},
{
"id": "c4",
"label": "HOS / ELD Training",
"expiry": "2027-08-06",
"notes": ""
}
]
},
{
"id": "d2",
"name": "Alicia Santos",
"driverId": "DRV-1087",
"certs": [
{
"id": "c5",
"label": "CDL Class A",
"expiry": "2027-02-20",
"notes": ""
},
{
"id": "c6",
"label": "Medical Card",
"expiry": "2026-09-15",
"notes": "Renewal scheduled at Concentra"
},
{
"id": "c7",
"label": "Defensive Driving",
"expiry": "2027-07-30",
"notes": ""
}
]
},
{
"id": "d3",
"name": "Darrell Whitfield",
"driverId": "DRV-1102",
"certs": [
{
"id": "c8",
"label": "CDL Class A",
"expiry": "2026-07-01",
"notes": "Suspended \u2014 follow-up needed"
},
{
"id": "c9",
"label": "Medical Card",
"expiry": "2026-03-12",
"notes": "Expired"
}
]
}
]
},
"usaf_roster_db": {
"key": "usaf_roster_v1",
"value": [
{
"name": "Marcus Reed",
"license": "DRV-1024",
"warehouse": "OKC North",
"hireDate": "2021-09-10",
"trainer": "J. Kowalski"
},
{
"name": "Alicia Santos",
"license": "DRV-1087",
"warehouse": "OKC North",
"hireDate": "2022-08-15",
"trainer": "S. Nakamura"
},
{
"name": "Darrell Whitfield",
"license": "DRV-1102",
"warehouse": "Tulsa Yard",
"hireDate": "2019-04-02",
"trainer": "T. Beaumont"
},
{
"name": "Kyle Osei",
"license": "TRN-2001",
"warehouse": "OKC North",
"hireDate": "2026-05-01",
"trainer": "B. Tran"
},
{
"name": "Rebecca Hall",
"license": "TRN-2007",
"warehouse": "Dallas Metro",
"hireDate": "2026-07-06",
"trainer": "S. Nakamura"
}
]
}
};

function __seedPut__(dbName, key, value) {
  return new Promise(function (res, rej) {
    var rq = indexedDB.open(dbName, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
    rq.onsuccess = function () {
      var db = rq.result;
      var tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = function () { db.close(); res(); };
      tx.onerror = function () { db.close(); rej(tx.error); };
    };
    rq.onerror = function () { rej(rq.error); };
  });
}
var __seedChain__ = Promise.resolve();
Object.keys(__SEED_DBS__).forEach(function (db) {
  var key = __SEED_DBS__[db].key, val = __SEED_DBS__[db].value;
  __seedChain__ = __seedChain__.then(function () {
    return __seedPut__(db, key, val).then(function () {
      if (console && console.log) console.log('seeded', db, key, JSON.stringify(val).length + 'B');
    }, function (e) { if (console) console.warn('seed fail', db, e); });
  });
});
