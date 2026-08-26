export const verificationEmailHtml = (otp: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Soundrift account</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:48px 16px">
        <table width="480" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;width:100%;background:linear-gradient(165deg,#1a1c23 0%,#101218 100%);border-radius:28px;border:1px solid rgba(255,255,255,0.08);padding:48px 36px;box-shadow:0 30px 60px rgba(0,0,0,0.6)">
          
          <!-- Logo Area -->
          <tr>
            <td align="center" style="padding-bottom:8px">
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:16px 0 4px;letter-spacing:-0.5px">Soundrift</h1>
              <p style="color:#9ca3af;font-size:14px;margin:0 0 28px">Drift Into Your Next Favorite.</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:1px;background:rgba(255,255,255,0.06);margin:0 -36px 28px;display:block"></td></tr>

          <!-- Body -->
          <tr>
            <td align="center" style="padding-bottom:8px">
              <p style="color:#e5e7eb;font-size:16px;margin:0 0 4px;line-height:1.6">Verify your email address</p>
              <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;line-height:1.5">Use the code below to complete your registration.</p>
            </td>
          </tr>

          <!-- OTP Box -->
          <tr>
            <td align="center" style="padding-bottom:32px">
              <table cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(0,0,0,0.45);border:1px solid rgba(29,185,84,0.25);border-radius:16px;padding:20px 40px;display:inline-table">
                <tr>
                  <td style="letter-spacing:14px;font-size:38px;font-weight:700;color:#ffffff;font-family:'Courier New',Courier,monospace;text-align:center">${otp}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer Info -->
          <tr>
            <td align="center">
              <p style="color:#9ca3af;font-size:13px;margin:0;line-height:1.5">This code expires in <strong style="color:#e5e7eb;font-weight:600">10 minutes</strong>.</p>
              <p style="color:#6b7280;font-size:12px;margin:16px 0 0;line-height:1.5">If you didn't request this, please ignore this email.<br>No changes have been made to your account.</p>
            </td>
          </tr>

          <!-- Footer Brand -->
          <tr>
            <td align="center" style="padding-top:32px">
              <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:24px;display:block"></div>
              <p style="color:#6b7280;font-size:11px;margin:0;letter-spacing:0.5px">SOUNDRIFT &bull; DRIFT INTO YOUR NEXT FAVORITE.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
