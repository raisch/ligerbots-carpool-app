/** @module routes/carpool/[id] */

import Event from '$lib/server/event.js'
import Ride from '$lib/server/ride'
import Rider from '$lib/server/rider'
import User from '$lib/server/user'
import { redirect } from '@sveltejs/kit'

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, cookies }) {
  const id = params.id
  let event

  const jwt = cookies.get('jwt')
  const user = User.validate(jwt || '');

  // const userCookie = cookies.get('user')
  // const user = userCookie ? await User.findByEmail(JSON.parse(decodeURIComponent(userCookie ?? '')).email_address) : null
  if (!user) redirect(303, `/login?redirect=/carpool/${id}`)
  const userId = user.id
  if (!userId) redirect(303, `/login?redirect=/carpool/${id}`)

  try {
    event = await Event.getEventById(id)
  } catch (error) {
    console.error(error)
  }

  // Is the user already signed up for the event?
  const isRegistered = event?.attendees?.some(attendee => attendee.users_id.id === userId) ?? false;

  // List of rides that the user is already in
  const existingRides = event?.trips?.map(trip => trip.item.rides.filter(ride => ride.item.riders.some(rider => rider.item?.id === userId)).map(ride => ride.item.id)).flat() ?? [];

  const allCars = await Ride.getAllRides()
  const userOwnedCars = allCars.filter(ride => ride.driver?.some(driver => driver.id === userId))
  const userCanHaveCar = user?.carpool_driver_eligible ?? false;

  const allUsers = await User.listForDirectory()

  const isAdmin = user?.is_admin ?? false;


  return { event, userId, isAdmin, jwt, isRegistered, existingRides, cars: { allCars: isAdmin ? allCars : userOwnedCars, userOwnedCars, userCanHaveCar }, users: { allUsers } }
}
