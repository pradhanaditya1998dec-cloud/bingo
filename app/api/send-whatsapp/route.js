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

    const formattedPhone = phoneNumber.startsWith("+")
      ? phoneNumber.replace("+", "")
      : phoneNumber;

    const winMessages = {
      topLine: `🎯 Congratulations! You won TOP LINE on ticket ${ticketId}! 🎉`,
      middleLine: `🎯 Congratulations! You won MIDDLE LINE on ticket ${ticketId}! 🎉`,
      lastLine: `🎯 Congratulations! You won LAST LINE on ticket ${ticketId}! 🎉`,
      corners: `🔶 Congratulations! You won CORNERS on ticket ${ticketId}! 🎉`,
      fullHouse: `🏆 JACKPOT! You won FULL HOUSE on ticket ${ticketId}! 🏆🎉`,
      secondFullHouse: `🏆 JACKPOT! You won 2ND FULL HOUSE on ticket ${ticketId}! 🏆🎉`,
    };

    const message = winMessages[winType] || `You won on ticket ${ticketId}!`;

    console.log(`WhatsApp message queued for ${formattedPhone}: ${message}`);

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
