# Akara WhatsApp Conversation Map

This document maps the MVP WhatsApp experience screen by screen.

## Global Commands

Users can type or tap:

- Start
- Create listing
- Find offer
- My listings
- My deals
- Verify me
- Pay fee
- Report issue
- Help

## Screen 1: Welcome

Bot:

Welcome to Akara.

Find verified people to exchange NGN and RWF directly, track the deal, and reduce the usual back-and-forth.

Choose an option:

- Find an offer
- Create a listing
- Verify me
- How it works

Rules:

- If the user is new, create a profile shell using WhatsApp phone number.
- If user is unverified, allow browsing but block reservation and listing creation until verification is started or completed.

## Screen 2: How It Works

Bot:

Akara helps verified users find and complete peer-to-peer exchanges.

1. Create or find an offer.
2. Reserve the deal.
3. Transfer directly to the other person.
4. Upload proof.
5. Both sides confirm.
6. Pay Akara's small success fee.

Akara does not hold funds in this version.

Buttons:

- Verify me
- Find offer
- Create listing

## Screen 3: Verification Start

Bot:

To keep Akara safer, you need to verify before creating or reserving a deal.

You will upload your ID through a secure link, not inside WhatsApp.

Buttons:

- Start verification
- Later

On start:

- Generate secure verification URL.
- Save verification status as pending_input.
- Send link.

## Screen 4: Verification Pending

Bot:

Your verification is being checked.

You can browse offers while you wait, but you cannot reserve or create listings yet.

Buttons:

- Browse offers
- Check status

## Screen 5: Verification Approved

Bot:

You are verified on Akara.

You can now create listings, reserve offers, and build your trade reputation.

Buttons:

- Create listing
- Find offer

## Screen 6: Create Listing - Direction

Bot:

What currency do you have?

Options:

- NGN
- RWF

Next:

Bot:

What currency do you want?

Options:

- NGN
- RWF

Rules:

- For MVP, block same-currency listings.
- Corridor must be enabled by admin.

## Screen 7: Create Listing - Amounts

Bot:

How much NGN do you have?

User:

50000

Bot:

How much RWF do you want for 50,000 NGN?

User:

55000

Bot:

Your rate is 1 NGN = 1.10 RWF.

Should this rate be firm or flexible?

Buttons:

- Firm rate
- Flexible rate

## Screen 8: Create Listing - Payment Details

Bot:

Add the receiving details for the currency you want.

For RWF, enter:

- MoMo name
- MoMo number
- Network

For NGN, enter:

- Bank name
- Account number
- Account name

Rules:

- Store payment details encrypted later.
- For MVP, only show payment details after a deal is reserved.

## Screen 9: Listing Confirmation

Bot:

Review your listing:

You give: 50,000 NGN
You receive: 55,000 RWF
Offer terms: Firm rate
Rate: 1 NGN = 1.10 RWF
Service fee: 100 NGN

Buttons:

- Publish listing
- Edit
- Cancel

On publish:

- Create listing with status active.
- Listing is visible in search.

## Screen 10: Find Offer - Direction

Bot:

What currency do you have?

Options:

- NGN
- RWF

Bot:

What currency do you need?

Options:

- NGN
- RWF

Bot:

How much do you want to exchange?

User:

50000

## Screen 11: Search Results

Bot:

I found 3 offers for NGN -> RWF:

1. 50,000 NGN for 55,000 RWF
Verified user, 12 completed deals, fixed.

2. 50,000 NGN for 54,500 RWF
Verified user, 3 completed deals, fixed.

3. Open offer
User is accepting offers for 50,000 NGN.

Buttons:

- View 1
- View 2
- View 3
- Refine search

Rules:

- Do not show phone number or payment details yet.
- Rank by exact amount, rate quality, verification, completion count, and freshness.
- Hide listings already reserved or completed.

## Screen 12: Offer Detail

Bot:

Offer RJ-2041

Seller gives: 50,000 NGN
Seller wants: 55,000 RWF
Rate: 1 NGN = 1.10 RWF
User status: Verified
Completed deals: 12
Akara success fee if completed: 100 RWF

Buttons:

- Reserve offer
- Back
- Report listing

## Screen 13: Reserve Offer

Bot:

You are about to reserve this offer for 15 minutes.

Only reserve if you are ready to complete the transfer.

If you repeatedly reserve and cancel, Akara may temporarily limit your account.

Buttons:

- Reserve now
- Cancel

On reserve:

- Listing status becomes reserved.
- Deal status becomes reserved.
- Other users no longer see the listing.
- Both parties receive deal room messages.

## Screen 14: Deal Room Created

Bot to both parties:

Deal RJ-2041 is reserved for 15 minutes.

Do not continue outside Akara. Use the buttons here so your reputation and protection stay active.

Buttons:

- View instructions
- Cancel deal
- Need help

## Screen 15: Transfer Instructions

Bot to NGN sender:

Send 50,000 NGN to:

Bank: Access Bank
Account name: Hidden until deal starts / visible now
Account number: 1234567890

After sending, tap "I have sent" and upload proof.

Bot to RWF sender:

Send 55,000 RWF to:

Network: MTN MoMo
Name: Visible now
Number: 07XXXXXXXX

After sending, tap "I have sent" and upload proof.

Buttons:

- I have sent
- I need more time
- Cancel deal
- Need help

## Screen 16: Proof Upload

Bot:

Upload proof using this secure link.

Buttons:

- Upload proof
- I cannot upload

After upload:

- Mark party transfer status as sent_pending_counterparty.
- Notify the other party.

## Screen 17: Counterparty Confirmation

Bot:

The other party says they have sent.

Check your account and confirm when received.

Buttons:

- I have received
- Not received yet
- Report issue

Rules:

- If both parties mark received, deal becomes completed_pending_fee.
- If one party reports, deal becomes disputed.

## Screen 18: Fee Collection

Bot:

Deal RJ-2041 is completed.

Service fee: 100 RWF.

Pay to:

MoMo: Akara fee number

Then tap "I paid fee".

Buttons:

- I paid fee
- Need help

Rules:

- MVP can use manual admin verification.
- After admin marks both fees paid, deal becomes closed.
- If fee is unpaid after grace period, user can be reminded and eventually limited.

## Screen 19: Deal Closed

Bot:

Deal completed.

Your Akara reputation has been updated.

Buttons:

- Rate experience
- Create listing
- Find another offer

## Screen 20: Cancellation

Bot:

Why are you cancelling?

Options:

- I changed my mind
- Other party is slow
- Payment details look wrong
- Rate is wrong
- Other

Rules:

- If cancellation happens before instructions are viewed, lighter penalty.
- If cancellation happens after details are revealed, stronger penalty.
- Repeated cancellations trigger holds.

## Screen 21: Penalty Notice

Bot:

You have cancelled multiple reserved deals today.

To keep listings reliable, your account is paused for 30 minutes.

Buttons:

- View my deals
- Contact support

## Screen 22: Negotiable Listing

Listing creator:

I have 50,000 NGN and I am open to RWF offers.

Interested user:

Bot:

What RWF amount do you offer?

User:

54000

Bot to listing creator:

New offer for RJ-2048:

50,000 NGN for 54,000 RWF
User: Verified, 4 completed deals.

Buttons:

- Accept
- Counter
- Decline

Rules:

- Keep negotiation inside Akara.
- Do not reveal contact details until accepted.

## Screen 23: Report Issue

Bot:

What is wrong?

Options:

- I paid but did not receive
- They say they paid but I did not receive
- Wrong payment details
- Suspicious user
- Fee issue
- Other

Bot:

Please upload proof or describe what happened.

Rules:

- Deal status becomes disputed.
- Notify admin.
- Freeze reputation update until admin closes dispute.

## Screen 24: My Listings

Bot:

Your listings:

1. RJ-2041: 50,000 NGN -> 55,000 RWF, active.
2. RJ-2044: 100,000 NGN -> open offers, reserved.

Buttons:

- View 1
- View 2
- Create new

Listing actions:

- Pause
- Edit rate
- Cancel listing
- Mark unavailable

## Screen 25: My Deals

Bot:

Your recent deals:

1. RJ-2041: Completed, fee paid.
2. RJ-2043: Cancelled.
3. RJ-2048: Disputed, admin reviewing.

Buttons:

- View deal
- Report issue
- Find offer
