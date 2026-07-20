<?php

if ( ! post_type_exists( 'annotate_review' ) ) {
	throw new RuntimeException( 'annotate_review post type is not registered.' );
}

$routes = rest_get_server()->get_routes();
if ( ! isset( $routes['/annotate/v1/reviews'] ) ) {
	throw new RuntimeException( 'Review submission route is not registered.' );
}

$admin = get_user_by( 'login', 'admin' );
wp_set_current_user( $admin->ID );
add_filter( 'pre_wp_mail', '__return_true' );

do_action( 'wp_enqueue_scripts' );
if ( ! wp_script_is( 'annotate-review-bridge', 'enqueued' ) || ! wp_script_is( 'annotate-review', 'enqueued' ) ) {
	throw new RuntimeException( 'Authorized reviewers do not receive the local annotation scripts.' );
}

$denied = rest_do_request( new WP_REST_Request( 'POST', '/annotate/v1/reviews' ) );
if ( 403 !== $denied->get_status() ) {
	throw new RuntimeException( 'Review submission without a REST nonce was not denied.' );
}

$request = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
$request->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
$request->set_body_params(
	array(
		'reviewer' => array( 'name' => 'Jane Reviewer', 'email' => 'jane@example.test' ),
		'message'  => 'Homepage review is ready.',
		'review'   => array(
			'kind'     => 'annotate-export',
			'page'     => '/about',
			'url'      => home_url( '/about' ),
			'comments' => array(
				array( 'id' => 'one', 'type' => 'element', 'verdict' => 'change', 'text' => 'Change <header> safely' ),
			),
		),
	)
);
$response = rest_do_request( $request );
if ( 201 !== $response->get_status() ) {
	throw new RuntimeException( 'Valid review submission did not return 201.' );
}
$result = $response->get_data();
if ( empty( $result['id'] ) || true !== $result['mailSent'] || 'private' !== get_post_status( $result['id'] ) ) {
	throw new RuntimeException( 'Review was not privately stored before email notification.' );
}
$stored_json = get_post_meta( $result['id'], '_annotate_review_json', true );
$stored      = json_decode( $stored_json, true );
if ( 'one' !== $stored['comments'][0]['id'] || 'Change <header> safely' !== $stored['comments'][0]['text'] ) {
	throw new RuntimeException( 'Stored review does not preserve the portable comment JSON.' );
}
if ( $admin->ID !== $stored['submission']['submittedBy']['id'] ) {
	throw new RuntimeException( 'Stored review does not record the authenticated submitter.' );
}

remove_filter( 'pre_wp_mail', '__return_true' );
add_filter( 'pre_wp_mail', '__return_false' );
$failed_mail_request = clone $request;
$failed_mail_response = rest_do_request( $failed_mail_request );
$failed_mail_result   = $failed_mail_response->get_data();
if ( 201 !== $failed_mail_response->get_status() || true === $failed_mail_result['mailSent'] || 'private' !== get_post_status( $failed_mail_result['id'] ) ) {
	throw new RuntimeException( 'A mail failure discarded the saved review.' );
}

echo "WordPress plugin smoke test passed.\n";
