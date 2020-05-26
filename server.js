//Set up server
var express = require('express');
var app = express();

//Set up cors for remote connection 
var cors = require('cors');
app.use(cors())

//set up firestore connection
const firebase = require("firebase");
require("firebase/firestore");

//require access to users
// var admin = require('firebase-admin');


//set up local storage

if (typeof localStorage === "undefined" || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    localStorage = new LocalStorage('./scratch');
}

//Set up parser to read content received from front-end
var bodyParser = require('body-parser')

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


// Initialize Cloud Firestore through Firebase
firebase.initializeApp({
    apiKey: "AIzaSyAwUXgW6KpoyjUnTvXH5j99_1fEhSfr9RA",
    authDomain: "mdp-beky.firebaseapp.com",
    projectId: "mdp-beky"
});

var db = firebase.firestore();
// var adminApp = admin.initializeApp();

//Library for decryption
const CryptoJS = require("crypto-js");

//Set up node mailer for sending emails about critical conditions
var nodemailer = require('nodemailer');


//set up mqtt connection
var mqtt = require('mqtt')
//change the IP en meme tps que sahar 
var client = mqtt.connect('http://212.98.137.194:1883', { 'username': 'user', 'password': 'bonjour' })

client.on('connect', function () {
    client.subscribe('application/19/device/804a2bad98eef9b1/rx', function (err) {
        if (!err) {
            console.log("connected");
            //client.publish('presence', 'Attention! Le patient doit etre surveille')
            //client.publish('application/19/device/804a2bad98eef9b1/rx', 'celine is listening')
        }
    })
})


client.on('message', function (topic, message) {
    // console.log("MESSAGE:", JSON.parse(message.toString()));
    var rcObject = JSON.parse(message.toString());
    var dec = decryptor(rcObject);
    // console.log(JSON.parse(dec))
    handleData(JSON.parse(dec));
})

var decryptor = (encrypted) => {
    var key = CryptoJS.enc.Hex.parse(encrypted.key),
        iv = CryptoJS.enc.Hex.parse(encrypted.iv),
        cipher = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Base64.parse(encrypted.ciphertext)
        }),
        result = CryptoJS.AES.decrypt(cipher, key, { iv: iv, mode: CryptoJS.mode.CFB });
    return result.toString(CryptoJS.enc.Utf8);
}

async function sendNotif(data,vitals, dr_id) {
    console.log("data in send email", data)
    let dr_email = await getDrEmail(dr_id)

    let transporter = nodemailer.createTransport({
        service: 'hotmail',
        auth: {
            user: 'bekyalert@hotmail.com',
            pass: 'MDPalert2020'
        }
    });

    let message = "Dear doctor,\n \n We would like to inform you that patient " + data.fname + " " + data.lname + " is in critical condition. \nHere are their vitals: \nHeart Rate: " + vitals.heartrate + "bpm, \nBlood Pressure: " + vitals.bloodpressure + "mmHg, \nGlucose: " + vitals.glucose + "mg/dL, \nFall: " +vitals.fall + ", \nTemperature: " + vitals.temperature+ " Celsius degrees." + "\nKindly check our website http://localhost:4200/login for more information or call an ambulance on 140 to  \n" + vitals.location + "\n \nSincerely, \nThe BEKY Team."

    let mailOptions = {
        from: 'bekyalert@hotmail.com',
        to: dr_email.toString(),
        subject: 'IMPORTANT: Patient in Critical Health Condition!',
        text: message
    };

    let i = await transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });

}

//test the email notification: 
//////////////////////////////

// sendNotif({
//     fname: "Celine",
//     lname: "Beyrouthy"
// } , {
//     heartrate: 101, 
//     glucose: 50, 
//     temperature: 37, 
//     fall:1, 
//     location: "Lat: 3353.0148 N -- Lon: 03534.5457 E -- Altitude: 167.0 M", 
//     bloodpressure: 50
// },  1);


//data to be sent to db
async function handleData(data) {
    try {

        let newd = data;
        console.log("DATA : ", newd)

        let vitals = {
            "heartrate": newd.heart_rate, 
            "glucose": newd.glucose, 
            "temperature": newd.temperature, 
            "fall": newd.fall, 
            "location": newd.location, 
            "bloodpressure": newd.blood_pressure
        }

        let info = await getPatient(newd.patient_id)
        if (newd.fall == 1 || newd.blood_pressure >= 180) { await sendNotif(info, vitals, newd.dr_id) }

        let ref = await db.collection("patients").doc(newd.patient_id.toString())
        //to populate the database: 
        // var sex = (newd.sex == 0)? "Female":"Male" 
        // var upd = await ref.update({ "birthdate": newd.birthdate, "gender": sex, "age": newd.age })
        var ref1 = await ref.collection("data").doc(newd.data_id.toString())
        var upd1 = await ref1.set({ "date": newd.date, "heartrate": newd.heart_rate, "glucose": newd.glucose, "temperature": newd.temperature, "fall": newd.fall, "location": newd.location, "critical": newd.critical, "bloodpressure": newd.blood_pressure })

        if (upd1 && upd) {
            console.log("The data has been successfully sent to the BEKY database.")
        }
    }
    catch (err) {
        console.log(err);
    }
}


async function getPatient(id) {
    let result = await db.collection("patients").get()
    return new Promise(async (resolve, reject) => {
        let data;
        let arr = result.docs.filter(x => x.data().id == id.toString());
        for (let document of arr) {
            try {
                data = {
                    "fname": document.data().fname,
                    "lname": document.data().lname
                }
                console.log(data)
            } catch (e) {
                console.log(e)
                reject("Failed to fetch data")
            }
        }
        resolve(data);
    });
}


async function f(id) {
    return new Promise(async (resolve, reject) => {

        let result2 = await db.collection('patients').doc(id).collection('data').get()
        let healthData = []
        if (result2) {
            result2.docs.forEach(e => {
                healthData.push(e.data());
            })
            resolve(healthData)
        }

        else {
            console.log("Failed to fetch health data")
            reject("Failed to fetch health data")
        }

    });

}

async function filterDrData(result, dr_id) {
    return new Promise(async (resolve, reject) => {
        let data = [];
        let arr = result.docs.filter(x => x.data().dr_id == dr_id);

        for (let document of arr) {
            try {
                var healthData = await f((document.data().id).toString())
                var obj = {}
                obj = {
                    "id": document.data().id.toString(),
                    "fname": document.data().fname,
                    "lname": document.data().lname,
                    "gender": document.data().gender,
                    "birthdate": document.data().birthdate,
                    "health": healthData
                }
                data.push(obj)
            } catch (e) {
                console.log(e)
                reject("Failed to fetch data")
            }
        }
        resolve(data);
    });

}

app.get('/getPatientData', async function (req, res) {
    try {
        let dr_id = await getUserID();
        let result = await db.collection("patients").get();
        let result2 = await filterDrData(result, parseInt(dr_id));
        res.send(result2);

    }
    catch (err) {
        console.log(err);
    }
})


async function filterHealthData(id) {

    return new Promise(async (resolve, reject) => {
        let result = await db.collection("patients").doc(id)
        let tmp = await result.get()
        let result2 = await result.collection('data').get()
        let healthData = []
        if (result2) {
            result2.docs.forEach(e => {
                healthData.push(e.data());
            })

            let patientInfo = {
                "fname": tmp.data().fname,
                "lname": tmp.data().lname,
                "gender": tmp.data().gender,
                "birthdate": tmp.data().birthdate,
                "healthData": healthData
            }
            console.log(patientInfo)
            resolve(patientInfo)
        }

        else {
            console.log("Failed to fetch health data")
            reject("Failed to fetch health data")
        }

    });
}

app.get('/getPersonalData', async function (req, res) {
    try {
        let id = (await getUserID()).toString();
        let result = await filterHealthData(id);
        res.send(result);

    }
    catch (err) {
        console.log(err);
    }
})

async function getDrEmail(id) {

    let result = await db.collection("doctors").doc(id.toString())

    let arr = result.get()
    let dr_email = (await arr).data().email

    console.log(dr_email)

    return dr_email
}

async function getUserID() {
    let id = JSON.parse(localStorage.getItem('user')).id;
    return id;
}

async function getAccessType(email) {
    let result = await db.collection("users").get()
    return new Promise(async (resolve, reject) => {
        let data;
        let arr = result.docs.filter(x => x.data().email == email.toString());
        // console.log(typeof(arr));
        for (let document of arr) {
            try {
                // console.log("DOC: ", document);
                data = document.data();
                // console.log(data);
            } catch (e) {
                console.log(e)
                reject("Failed to fetch data")
            }
        }
        resolve(data);
    });
}

// getAccessType("celine.beyrouthy@net.usj.edu.lb");

app.post('/getAccessType', async function (request, response) {

    var user = await getAccessType(request.body.email);
    var tmpUser = {
        "type": user.type,
        "id": user.id,
        "email": user.email
    };

    localStorage.setItem('user', JSON.stringify(tmpUser));

    var tmp = localStorage.getItem('user');

    // console.log(JSON.parse(tmp));

    response.send(tmpUser);

});


var server = app.listen(8081, function () {
    var host = server.address().address
    var port = server.address().port

    console.log("Server listening at http://%s:%s", host, port)
})


