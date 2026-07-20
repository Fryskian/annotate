<?php

update_option( 'annotate_review_public_staging', '1' );
if ( ! function_exists( 'annotate_review_public_mode' ) ) {
	throw new RuntimeException( 'The environment-gated public mode is missing.' );
}
if ( annotate_review_public_mode() ) {
	throw new RuntimeException( 'Public mode was enabled outside the staging environment.' );
}

$subscriber_id = username_exists( 'review-subscriber' );
if ( ! $subscriber_id ) {
	$subscriber_id = wp_create_user( 'review-subscriber', 'test-only-password', 'subscriber@example.test' );
	( new WP_User( $subscriber_id ) )->set_role( 'subscriber' );
}
wp_set_current_user( $subscriber_id );

do_action( 'wp_enqueue_scripts' );
if ( wp_script_is( 'annotate-review', 'enqueued' ) || wp_script_is( 'annotate-review-bridge', 'enqueued' ) ) {
	throw new RuntimeException( 'Annotation scripts were loaded for an unauthorized user.' );
}

$request = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
$request->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
if ( 403 !== rest_do_request( $request )->get_status() ) {
	throw new RuntimeException( 'A user without edit_pages can submit reviews.' );
}

echo "WordPress access test passed.\n";
