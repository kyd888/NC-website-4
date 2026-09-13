import type { FulfillmentChoice, ShowMerchOffer, ShowMerchShow } from "../lib/showMerch";
import { chosenShow, showProblemFor } from "../lib/showMerch";

type Props = {
  offer: ShowMerchOffer;
  choice: FulfillmentChoice;
  onChange: (choice: FulfillmentChoice) => void;
  /** Show merch product ids in the bag, so a product-specific cutoff can be reported. */
  cartShowMerchIds: string[];
  titleOf: (productId: string) => string;
  /** Other items in the bag ship the usual way. */
  hasOtherItems: boolean;
  /** A problem the server reported, e.g. pickup closed during checkout. */
  notice?: string | null;
  /** Unique per rendering, so the bag and checkout don't share ids. */
  idPrefix: string;
  /** Formats cents for the delivery fee line. */
  formatCurrency: (cents: number) => string;
};

/**
 * "Show pickup" or "Ship after the show", as two radio cards.
 *
 * Neither card shows a price: the price is the product's, identical either way
 * (the sub-line says so, or names the delivery fee when there is one).
 *
 * An unavailable option stays in the list, greyed out and explained: it is
 * marked aria-disabled rather than disabled, so screen readers still reach it
 * and read out why. Selecting it does nothing, and nothing is ever selected
 * for the customer. Guidance is neutral; only a server-reported problem (the
 * notice) is styled as an error.
 */
export default function FulfillmentPicker({
  offer,
  choice,
  onChange,
  cartShowMerchIds,
  titleOf,
  hasOtherItems,
  notice,
  idPrefix,
  formatCurrency,
}: Props) {
  const pickupOpen = offer.pickup.state === "available";
  const shipOpen = offer.shipping.available;
  const shows = offer.pickup.shows;
  const single = shows.length === 1 ? shows[0] : null;
  const pickedShow = chosenShow(offer, choice);
  const pickupOn = choice.method === "pickup";
  const shipOn = choice.method === "ship";
  // A show that can't take every item in the bag (a product-specific cutoff passed).
  const showProblem = (show: ShowMerchShow | null) => (show ? showProblemFor(show, cartShowMerchIds, titleOf) : null);
  const singleProblem = single ? showProblem(single) : null;
  const pickupSelectable = pickupOpen && (!single || !singleProblem);

  const pickPickup = () => {
    if (!pickupSelectable) return;
    onChange({ method: "pickup", showId: single ? single.id : pickedShow?.id ?? null });
  };
  const pickShip = () => {
    if (!shipOpen) return;
    onChange({ method: "ship", showId: null });
  };

  const noticeId = `${idPrefix}-notice`;
  const pickupDetailId = `${idPrefix}-pickup-detail`;
  const shipDetailId = `${idPrefix}-ship-detail`;
  const subline = offer.samePrice
    ? offer.shipping.included && offer.shipping.regionLabel
      ? `Same price with either option. Standard shipping to ${offer.shipping.regionLabel} is included.`
      : "Same price with either option."
    : `Delivery adds ${formatCurrency(offer.shipping.feeCents)} for standard shipping${offer.shipping.regionLabel ? ` to ${offer.shipping.regionLabel}` : ""}.`;

  const showLine = (show: ShowMerchShow) => (
    <span className="fulfill__show">
      {show.name}
      <span>
        {show.dateLabel} · {show.location}
      </span>
    </span>
  );

  const pickupExtras = (show: ShowMerchShow) => (
    <>
      {show.hours ? <span className="fulfill__line">Pickup: {show.hours}</span> : null}
      {show.productCutoffs && cartShowMerchIds.some((id) => show.productCutoffs[id]?.override) ? (
        cartShowMerchIds
          .filter((id) => show.productCutoffs[id])
          .map((id) => (
            <span className="fulfill__line" key={id}>
              {titleOf(id)}: pickup orders close {show.productCutoffs[id].cutoffLabel}.
            </span>
          ))
      ) : show.cutoffLabel ? (
        <span className="fulfill__line">Pickup orders close {show.cutoffLabel}.</span>
      ) : null}
      {hasOtherItems ? <span className="fulfill__line">Other items in your bag still ship to your address.</span> : null}
      <details className="fulfill__more">
        <summary>More about pickup</summary>
        <div className="fulfill__more-body">
          <p>Bring your order confirmation (this screen or your receipt email).</p>
          {show.bonus ? <p>{show.bonus} included with your pickup.</p> : null}
          {show.instructions ? <p>{show.instructions}</p> : null}
          {offer.pickup.missedPickupPolicy ? (
            <p>
              <strong>If you can’t make it:</strong> {offer.pickup.missedPickupPolicy}
            </p>
          ) : null}
        </div>
      </details>
    </>
  );

  return (
    <fieldset className="fulfill" aria-describedby={notice ? noticeId : undefined}>
      <legend className="fulfill__legend">How do you want it?</legend>
      <p className="fulfill__sub">{subline}</p>

      {notice ? (
        <p className="fulfill__notice" id={noticeId} role="alert">
          {notice}
        </p>
      ) : null}

      <label className={`fulfill__option${pickupOn ? " is-on" : ""}${pickupSelectable ? "" : " is-disabled"}`}>
        <input
          type="radio"
          name={`${idPrefix}-fulfillment`}
          value="pickup"
          checked={pickupOn}
          aria-disabled={pickupSelectable ? undefined : true}
          aria-describedby={pickupDetailId}
          onChange={pickPickup}
        />
        <span className="fulfill__body">
          <span className="fulfill__head">
            <span className="fulfill__title">{offer.labels.pickup}</span>
            {offer.bonusBadge ? <span className="fulfill__badge">{offer.bonusBadge}</span> : null}
          </span>
          <span className="fulfill__detail" id={pickupDetailId}>
            {pickupOpen ? (
              <>
                {single ? (
                  <>
                    {showLine(single)}
                    {singleProblem ? <span className="fulfill__line">{singleProblem}</span> : pickupOn ? pickupExtras(single) : null}
                  </>
                ) : (
                  <span className="fulfill__line">
                    {shows.length} shows open for pickup{pickupOn ? ". Choose one below." : "."}
                  </span>
                )}
                {!single && pickupOn && pickedShow ? (showProblem(pickedShow) ? <span className="fulfill__line">{showProblem(pickedShow)}</span> : pickupExtras(pickedShow)) : null}
              </>
            ) : (
              <>
                {offer.pickup.closedShow ? showLine(offer.pickup.closedShow) : null}
                <span className="fulfill__line">{offer.pickup.message}</span>
              </>
            )}
          </span>
        </span>
      </label>

      {pickupOn && pickupOpen && shows.length > 1 ? (
        <fieldset className="fulfill__shows">
          <legend className="fulfill__legend fulfill__legend--small">Choose a show</legend>
          {shows.map((show) => {
            const problem = showProblem(show);
            return (
              <label key={show.id} className={`fulfill__show-option${pickedShow?.id === show.id ? " is-on" : ""}${problem ? " is-disabled" : ""}`}>
                <input
                  type="radio"
                  name={`${idPrefix}-show`}
                  value={show.id}
                  checked={pickedShow?.id === show.id}
                  aria-disabled={problem ? true : undefined}
                  onChange={() => {
                    if (!problem) onChange({ method: "pickup", showId: show.id });
                  }}
                />
                <span className="fulfill__show">
                  {show.name}
                  <span>
                    {show.dateLabel} · {show.location}
                  </span>
                  {problem ? <span>{problem}</span> : null}
                </span>
              </label>
            );
          })}
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
          </span>
          <span className="fulfill__detail" id={shipDetailId}>
            {shipOpen ? (
              <>
                <span className="fulfill__line">
                  Ships after {offer.shipping.shipsAfterLabel}
                  {offer.shipping.dispatchEstimate ? ` · ${offer.shipping.dispatchEstimate}` : "."}
                </span>
                <span className="fulfill__line">
                  {offer.shipping.included
                    ? `Standard shipping to ${offer.shipping.regionLabel} included.`
                    : `Standard shipping to ${offer.shipping.regionLabel}${offer.shipping.feeCents ? ` — ${formatCurrency(offer.shipping.feeCents)}` : ""}.`}
                </span>
                {hasOtherItems ? <span className="fulfill__line">Other items in your bag ship to the same address.</span> : null}
              </>
            ) : (
              <span className="fulfill__line">Shipping isn’t available for this item yet.</span>
            )}
          </span>
        </span>
      </label>
    </fieldset>
  );
}

/** One line that says what was chosen, for the checkout summary card. */
export function describeChoice(offer: ShowMerchOffer, choice: FulfillmentChoice): { title: string; detail: string } | null {
  if (choice.method === "pickup") {
    const show = chosenShow(offer, choice);
    if (!show) return null;
    return {
      title: offer.labels.pickup,
      detail: [show.name, show.dateLabel, show.hours ? `Pickup: ${show.hours}` : "", offer.bonusBadge].filter(Boolean).join(" · "),
    };
  }
  if (choice.method === "ship" && offer.shipping.available) {
    return {
      title: offer.labels.ship,
      detail: [`After ${offer.shipping.shipsAfterLabel}`, offer.shipping.dispatchEstimate, `To ${offer.shipping.regionLabel}`].filter(Boolean).join(" · "),
    };
  }
  return null;
}
