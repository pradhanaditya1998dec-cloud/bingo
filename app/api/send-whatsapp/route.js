// app/api/send-whatsapp/route.js
export async function POST(req) {
  try {
    const { phoneNumber, winType, ticketId } = await req.json();

    if (!phoneNumber || !winType || !ticketId) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Format phone number (ensure international format)
    const formattedPhone = phoneNumber.startsWith("+")
      ? phoneNumber.replace("+", "")
      : phoneNumber;

    const winMessages = {
      topLine: `🎯 Congratulations! You won TOP LINE on ticket ${ticketId}! 🎉`,
      middleLine: `🎯 Congratulations! You won MIDDLE LINE on ticket ${ticketId}! 🎉`,
      lastLine: `🎯 Congratulations! You won LAST LINE on ticket ${ticketId}! 🎉`,
      fullHouse: `🏆 JACKPOT! You won FULL HOUSE on ticket ${ticketId}! 🏆🎉`,
    };

    const message = winMessages[winType] || `You won on ticket ${ticketId}!`;

    // Send via WhatsApp Web API (using wa.me link)
    // For production, use Twilio or Meta Cloud API
    console.log(
      `WhatsApp message queued for ${formattedPhone}: ${message}`
    );

    // In production, integrate with Twilio:
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    //   to: `whatsapp:+${formattedPhone}`,
    //   body: message,
    // });

    return Response.json(
      { success: true, message: `WhatsApp sent to +${formattedPhone}` },
      { status: 200 }
    );
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
