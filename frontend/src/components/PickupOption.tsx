import type { DeliveryChoice, PickupOffer, PickupShow } from "../lib/pickup";
import { chosenShow, shipAllowed } from "../lib/pickup";

type Props = {
  offer: PickupOffer;
  choice: DeliveryChoice;
  onChange: (choice: DeliveryChoice) => void;
  /** A problem the server reported, e.g. pickup closed while paying. */
  notice?: string | null;
};

/**
 * Delivery at checkout: "Ship to me" (the default) or "Pick up at the show".
 *
 * Checkout only renders this when a show is open for pickup, or when the
 * server just said a pickup choice stopped being possible. In that case the
 * pickup option stays, greyed out and explained (aria-disabled, so screen
 * readers still reach it), and nothing is switched for the customer.
 */
export default function PickupOption({ offer, choice, onChange, notice }: Props) {
  const open = offer.state === "available";
  // Pickup only: shipping isn't on offer at all, so there's nothing to choose
  // between. The pickup details still show, as the terms of the order.
  const canShip = shipAllowed(offer);
  const shows = offer.shows;
  const single = shows.length === 1 ? shows[0] : null;
  const picked = chosenShow(offer, choice);
  const pickupOn = choice.method === "pickup";
  const shipOn = !pickupOn;
  const detailShow = picked ?? single;
  const bonus = (picked ?? single ?? shows[0])?.bonus ?? "";

  const choosePickup = () => {
    if (!open) return;
    onChange({ method: "pickup", showId: single ? single.id : picked?.id ?? null });
  };

  const showLine = (show: PickupShow) => (
    <span className="fulfill__show">
      {show.name}
      <span>
        {show.dateLabel} · {show.location}
      </span>
    </span>
  );

  return (
    <fieldset className="fulfill" aria-describedby={notice ? "delivery-notice" : undefined}>
      <legend className="fulfill__legend">Delivery</legend>

      {notice ? (
        <p className="fulfill__notice" id="delivery-notice" role="alert">
          {notice}
        </p>
      ) : null}

      {canShip ? (
        <label className={`fulfill__option${shipOn ? " is-on" : ""}`}>
          <input type="radio" name="delivery" value="ship" checked={shipOn} onChange={() => onChange({ method: "ship", showId: null })} />
          <span className="fulfill__body">
            <span className="fulfill__head">
              <span className="fulfill__title">{offer.labels.ship}</span>
            </span>
          </span>
        </label>
      ) : (
        <p className="fulfill__only">{offer.shipMessage || "This drop is pickup only."}</p>
      )}

      <label className={`fulfill__option${pickupOn ? " is-on" : ""}${open ? "" : " is-disabled"}`}>
        <input
          type="radio"
          name="delivery"
          value="pickup"
          checked={pickupOn}
          aria-disabled={open ? undefined : true}
          aria-describedby="delivery-pickup-detail"
          onChange={choosePickup}
        />
        <span className="fulfill__body">
          <span className="fulfill__head">
            <span className="fulfill__title">{offer.labels.pickup}</span>
            {bonus && open ? <span className="fulfill__badge">{bonus} included</span> : null}
          </span>
          <span className="fulfill__detail" id="delivery-pickup-detail">
            {open ? (
              <>
                {single ? showLine(single) : <span className="fulfill__line">{shows.length} shows open for pickup.</span>}
                {pickupOn && detailShow ? (
                  <>
                    {!single ? showLine(detailShow) : null}
                    {detailShow.hours ? <span className="fulfill__line">Pickup: {detailShow.hours}</span> : null}
                    {detailShow.cutoffLabel ? <span className="fulfill__line">Pickup orders close {detailShow.cutoffLabel}.</span> : null}
                    <details className="fulfill__more">
                      <summary>More about pickup</summary>
                      <div className="fulfill__more-body">
                        <p>Bring your order confirmation (this screen or your receipt email).</p>
                        {detailShow.instructions ? <p>{detailShow.instructions}</p> : null}
                        {detailShow.missedPolicy ? (
                          <p>
                            <strong>If you can’t make it:</strong> {detailShow.missedPolicy}
                          </p>
                        ) : null}
                      </div>
                    </details>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {offer.closedShow ? showLine(offer.closedShow) : null}
                <span className="fulfill__line">{offer.message}</span>
              </>
            )}
          </span>
        </span>
      </label>

      {pickupOn && open && shows.length > 1 ? (
        <fieldset className="fulfill__shows">
          <legend className="fulfill__legend fulfill__legend--small">Choose a show</legend>
          {shows.map((show) => (
            <label key={show.id} className={`fulfill__show-option${picked?.id === show.id ? " is-on" : ""}`}>
              <input
                type="radio"
                name="delivery-show"
                value={show.id}
                checked={picked?.id === show.id}
                onChange={() => onChange({ method: "pickup", showId: show.id })}
              />
              {showLine(show)}
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
