"""English versions of the disaster types and actions in seed.py, in the same order.

The database keeps the Vietnamese text. For English requests the API swaps in these
translations (see routers/DisasterRoute.py); types or actions an administrator adds later have
no translation and are returned in Vietnamese.
"""

from seed import DISASTER_TYPES

DISASTER_TYPES_EN = {
    1: ("Storm", [
        ("Follow the weather forecast", "Check weather bulletins often to keep up with news about the storm."),
        ("Reinforce your home", "Tie down metal roofs and brace doors and windows so the roof is not torn off."),
        ("Trim trees", "Cut back large or weak branches near the house so they cannot fall and cause harm."),
        ("Prepare emergency supplies", "Keep torches, candles, bottled water and dry food ready."),
        ("Protect your belongings", "Move furniture and valuables to a high, dry place out of reach of floodwater."),
        ("Switch off electrical devices", "Turn off electrical appliances during heavy storms to avoid short circuits and fires."),
        ("Find a safe shelter", "Move to a solid shelter when the storm makes landfall."),
        ("Stay indoors during the storm", "Do not go outside at all while the storm is passing."),
        ("Contact rescue services", "Tell the local authorities immediately if you need rescue."),
        ("Recover after the storm", "Check for damage and make repairs after the storm has passed."),
    ]),
    2: ("Flood", [
        ("Follow flood warnings", "Keep a close eye on flood warnings from the authorities."),
        ("Evacuate in an emergency", "Move people and belongings to high, safe ground when ordered or when flooding threatens."),
        ("Cut off the power", "Switch off the main breaker to avoid electric shocks from floodwater."),
        ("Do not wade through dangerous water", "Never try to cross fast-flowing water."),
        ("Prepare life-saving equipment", "Have a boat or life jackets ready if you can."),
        ("Stock up on essentials", "Prepare drinking water, dry food and the medicines you need."),
        ("Stay in contact", "Keep in touch with the local authorities for information and help."),
        ("Follow evacuation orders", "Strictly follow the evacuation instructions of rescue teams."),
        ("Clean up after the flood", "Check that water and food are safe and clean once the water recedes."),
        ("Get back on your feet", "Take part in repairing homes and restoring daily life after the flood."),
    ]),
    3: ("Wildfire", [
        ("Raise fire awareness", "Spread the word about and strictly follow forest fire prevention rules."),
        ("Do not start fires", "Never light fires or throw away cigarette butts in or near forests."),
        ("Report fires quickly", "Tell the authorities immediately when you spot a forest fire."),
        ("Help fight the fire (if asked)", "Support firefighters if you are called on and have the right skills."),
        ("Leave the danger zone", "Quickly move people and belongings away from areas where the fire may spread."),
        ("Protect your breathing", "Cover your face and body with wet cloth to avoid breathing in smoke."),
        ("Move in a safe direction", "Move against the wind to avoid smoke and flames."),
        ("Find water to put out flames", "Use the nearest water to put out flames or to wet your clothes for protection."),
        ("Call an ambulance for injuries", "Contact emergency services at once if anyone is hurt by the fire."),
        ("Help with the clean-up", "Work with the authorities on firefighting and dealing with the aftermath."),
    ]),
    4: ("Landslide", [
        ("Watch for landslide signs", "Look out for cracks in the ground or walls and trees leaning unusually."),
        ("Evacuate immediately", "Move to a safe place at once when you notice a landslide risk."),
        ("Stay away from danger zones", "Do not go near areas with a high risk of landslides."),
        ("Report to the authorities", "Tell the local authorities about landslides or signs of one."),
        ("Do not build in risky places", "Avoid building homes on weak, unstable ground."),
        ("Reinforce where possible", "Strengthen slopes and structures in landslide-prone areas if you can."),
        ("Prepare basic rescue gear", "Keep essential rescue items such as rope and torches ready."),
        ("Find a safe shelter", "Move to a sturdy shelter when a landslide happens."),
        ("Beware of further landslides", "Watch for more landslides after long periods of heavy rain."),
        ("Help with the recovery", "Take part in the recovery work organised by the authorities."),
    ]),
    5: ("Drought", [
        ("Save water", "Use water sparingly and sensibly in daily life."),
        ("Store water", "Store clean water whenever you can."),
        ("Find other water sources", "Look for and use alternative water sources if available."),
        ("Put household needs first", "Make sure water goes to essential household needs first."),
        ("Follow drought updates", "Keep up with drought information from the authorities."),
        ("Adjust farming", "Change planting schedules and choose crops that suit dry conditions."),
        ("Care for crops and livestock", "Take special care to reduce damage to crops and animals."),
        ("Report water shortages", "Tell the local authorities about water shortages."),
        ("Support your community", "Help people affected by the drought."),
        ("Plan for the long term", "Learn about and adopt lasting drought-resilience measures."),
    ]),
    6: ("Heat wave", [
        ("Drink enough water", "Drink water, fruit juice or rehydration drinks regularly, even before you feel thirsty."),
        ("Wear light clothing", "Choose loose, light-coloured cotton clothes that let sweat evaporate."),
        ("Stay out of the midday sun", "Avoid going outside between 11:00 and 15:00; stay in the shade or indoors."),
        ("Cover up outdoors", "Wear a wide-brimmed hat and sunglasses, and use sunscreen."),
        ("Avoid heavy work", "Do not overexert yourself in the sun; rest often in a cool place."),
        ("Never leave children in a car", "Do not leave children, older people or pets in a closed car."),
        ("Cool your body down", "Take a cool shower or wipe yourself with cool water to lower your temperature."),
        ("Eat and drink sensibly", "Eat plenty of vegetables and fruit; limit beer and alcoholic drinks."),
        ("Recognise heatstroke", "Dizziness, nausea, headache and hot red skin are signs of heatstroke: move the person somewhere cool and call 115."),
        ("Prevent fires", "Do not overload electrical sockets, and keep flammable things away from heat on hot days."),
    ]),
    7: ("Earthquake", [
        ("Prepare in advance", "Fix tall cupboards and shelves to the wall; know where the main breaker and gas valve are."),
        ("Pack an emergency bag", "Prepare water, dry food, a torch, medicines, a whistle and important documents."),
        ("Drop, Cover, Hold on", "When shaking starts: drop down, get under a sturdy table, protect your head and neck, and hold on."),
        ("Stay away from glass", "Keep away from windows, glass, hanging objects and furniture that could fall."),
        ("Do not use lifts", "Do not run outside or use lifts while the ground is shaking."),
        ("If you are outdoors", "Move to an open space away from tall buildings, trees and power poles."),
        ("If you are driving", "Stop somewhere safe, away from bridges, overpasses and tunnels, and stay in the car."),
        ("Check after the earthquake", "Check for injuries, gas leaks and damage to wiring and pipes before using them again."),
        ("Beware of aftershocks", "Aftershocks can follow the main quake; do not go back into cracked or damaged buildings."),
        ("Watch out for tsunamis", "If you are near the coast and feel strong shaking, move to high ground at once."),
    ]),
}


def _build_lookup():
    names, actions = {}, {}
    for type_id, name_vi, actions_vi in DISASTER_TYPES:
        name_en, actions_en = DISASTER_TYPES_EN[type_id]
        assert len(actions_en) == len(actions_vi), f"type {type_id}: translation count mismatch"
        names[(type_id, name_vi)] = name_en
        for (title_vi, _), english in zip(actions_vi, actions_en):
            actions[(type_id, title_vi)] = english
    return names, actions


# (type id, Vietnamese name) -> English name
# (type id, Vietnamese action title) -> (English title, English description)
NAMES_EN, ACTIONS_EN = _build_lookup()
