import "dotenv/config";

const sendSMS = async (phoneNumber: string, verificationOTP: string) => {
    const messageBody = `Your verification code is ${verificationOTP}`;
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const client = require('twilio')(accountSid, authToken);
    client.messages
        .create({
            body: messageBody,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: phoneNumber
        })
        .then((message: { sid: any; }) => console.log(message.sid));
};

export default sendSMS;
