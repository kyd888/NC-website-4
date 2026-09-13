import type { FulfillmentChoice, ShowMerchOffer } from "../lib/showMerch";
import { chosenShow } from "../lib/showMerch";

type Props = {
  offer: ShowMerchOffer;
  choice: FulfillmentChoice;
  onChange: (choice: FulfillmentChoice) => void;
  /** The show merch price, identical for both options. */
  priceLabel: string;
  /** Other items in the bag ship the usual way. */
  hasOtherItems: boolean;
  /** A problem the server reported, e.g. pickup closed during checkout. */
  notice?: string | null;
  /** Unique per rendering, so the bag and checkout don't share ids. */
  idPrefix: string;
  /** Checkout shows pickup instructions and the missed-pickup policy in full. */
  detailed?: boolean;
};

/**
 * Pickup at a show or ship after the show, as two large radio cards.
 *
 * An unavailable option stays in the list, greyed out and explained: it is
 * marked aria-disabled rather than disabled, so screen readers still reach it
 * and read out why. Selecting it does nothing, and nothing is ever selected
 * for the customer.
 */
export default function FulfillmentPicker({
  offer,
  choice,
  onChange,
  priceLabel,
  hasOtherItems,
  notice,
  idPrefix,
  detailed = false,
}: Props) {
  const pickupOpen = offer.pickup.state === "available";
  const shipOpen = offer.shipping.available;
  const shows = offer.pickup.shows;
  const single = shows.length === 1 ? shows[0] : null;
  const pickedShow = chosenShow(offer, choice);
  const pickupOn = choice.method === "pickup";
  const shipOn = choice.method === "ship";

  const pickPickup = () => {
    if (!pickupOpen) return;
    onChange({ method: "pickup", showId: single ? single.id : pickedShow?.id ?? null });
  };
  const pickShip = () => {
    if (!shipOpen) return;
    onChange({ method: "ship", showId: null });
  };

  const noticeId = `${idPrefix}-notice`;
  const pickupDetailId = `${idPrefix}-pickup-detail`;
  const shipDetailId = `${idPrefix}-ship-detail`;

  return (
    <fieldset className="fulfill" aria-describedby={notice ? noticeId : undefined}>
      <legend className="fulfill__legend">How do you want it?</legend>
      <p className="fulfill__sub">Same price either way. Standard shipping is already in the price.</p>

      {notice ? (
        <p className="fulfill__notice" id={noticeId} role="alert">
          {notice}
        </p>
      ) : null}

      <label className={`fulfill__option${pickupOn ? " is-on" : ""}${pickupOpen ? "" : " is-disabled"}`}>
        <input
          type="radio"
          name={`${idPrefix}-fulfillment`}
          value="pickup"
          checked={pickupOn}
          aria-disabled={pickupOpen ? undefined : true}
          aria-describedby={pickupDetailId}
          onChange={pickPickup}
        />
        <span className="fulfill__body">
          <span className="fulfill__head">
            <span className="fulfill__title">{offer.labels.pickup}</span>
            <span className="fulfill__price">{priceLabel}</span>
          </span>
          <span className="fulfill__detail" id={pickupDetailId}>
            {pickupOpen ? (
              <>
                {single ? (
                  <span className="fulfill__show">
                    {single.name}
                    <span>
                      {single.dateLabel} · {single.location}
                    </span>
                  </span>
                ) : (
                  <span>
                    {shows.length} shows open for pickup{pickupOn ? ". Choose one below." : "."}
                  </span>
                )}
                {/* The rest only once it's chosen, so both options fit on a phone screen. */}
                {pickupOn ? (
                  <>
                    <span>Includes a {offer.bonus.toLowerCase()} as a pickup bonus.</span>
                    <span>Bring your order confirmation to pick up.</span>
                    {detailed && pickedShow?.cutoffLabel ? <span>Pickup orders close {pickedShow.cutoffLabel}.</span> : null}
                    {detailed && pickedShow?.instructions ? (
                      <span>
                        <strong>Pickup instructions:</strong> {pickedShow.instructions}
                      </span>
                    ) : null}
                    {detailed && offer.pickup.missedPickupPolicy ? (
                      <span>
                        <strong>If you can’t make it:</strong> {offer.pickup.missedPickupPolicy}
                      </span>
                    ) : null}
                    {hasOtherItems ? <span>Other items in your bag still ship to your address.</span> : null}
                  </>
                ) : null}
              </>
            ) : (
              <>
                {offer.pickup.closedShow ? (
                  <span className="fulfill__show">
                    {offer.pickup.closedShow.name}
                    <span>
                      {offer.pickup.closedShow.dateLabel} · {offer.pickup.closedShow.location}
                    </span>
                  </span>
                ) : null}
                <span>{offer.pickup.message}</span>
              </>
            )}
          </span>
        </span>
      </label>

      {pickupOn && pickupOpen && shows.length > 1 ? (
        <fieldset className="fulfill__shows">
          <legend className="fulfill__legend fulfill__legend--small">Choose a show</legend>
          {shows.map((show) => (
            <label key={show.id} className={`fulfill__show-option${pickedShow?.id === show.id ? " is-on" : ""}`}>
              <input
                type="radio"
                name={`${idPrefix}-show`}
                value={show.id}
                checked={pickedShow?.id === show.id}
                onChange={() => onChange({ method: "pickup", showId: show.id })}
              />
              <span className="fulfill__show">
                {show.name}
                <span>
                  {show.dateLabel} · {show.location}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className={`fulfill__option${shipOn ? " is-on" : ""}${shipOpen ? "" : " is-disabled"}`}>
        <input
          type="radio"
          name={`${idPrefix}-fulfillment`}
          value="ship"
          checked={shipOn}
          aria-disabled={shipOpen ? undefined : true}
          aria-describedby={shipDetailId}
          onChange={pickShip}
        />
        <span className="fulfill__body">
          <span className="fulfill__head">
            <span className="fulfill__title">{offer.labels.ship}</span>
            <span className="fulfill__price">{priceLabel}</span>
          </span>
          <span className="fulfill__detail" id={shipDetailId}>
            {shipOpen ? (
              <>
                <span>Ships after {offer.shipping.shipsAfterLabel}.</span>
                {offer.shipping.dispatchEstimate ? <span>{offer.shipping.dispatchEstimate}</span> : null}
                {shipOn || detailed ? <span>Standard shipping to {offer.shipping.regionLabel} included.</span> : null}
              </>
            ) : (
              <span>Shipping isn’t available for this item yet.</span>
            )}
          </span>
        </span>
      </label>
    </fieldset>
  );
}
