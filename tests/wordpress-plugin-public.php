<?php

if ( 'staging' !== wp_get_environment_type() ) {
	throw new RuntimeException( 'Public-mode test requires WP_ENVIRONMENT_TYPE=staging.' );
}
update_option( 'annotate_review_public_staging', '1' );
wp_set_current_user( 0 );
$_SERVER['REMOTE_ADDR'] = '203.0.113.15';

$ip_key = 'annotate_review_ip_' . md5( $_SERVER['REMOTE_ADDR'] . wp_salt( 'nonce' ) );
delete_transient( $ip_key );
delete_transient( 'annotate_review_site_limit' );
add_filter( 'pre_wp_mail', '__return_true' );

do_action( 'wp_enqueue_scripts' );
if ( ! wp_script_is( 'annotate-review', 'enqueued' ) || ! wp_script_is( 'annotate-review-bridge', 'enqueued' ) ) {
	throw new RuntimeException( 'Public staging visitors do not receive annotation scripts.' );
}
$localized = wp_scripts()->get_data( 'annotate-review-bridge', 'data' );
if ( false === strpos( $localized, '"canUpload":""' ) || false === strpos( $localized, '"publicMode":"1"' ) ) {
	throw new RuntimeException( 'Public staging configuration did not disable uploads.' );
}

$payload = array(
	'reviewer' => array( 'name' => 'Public Reviewer', 'email' => 'public@example.test' ),
	'message'  => 'Public staging review.',
	'review'   => array(
		'kind'     => 'annotate-export',
		'url'      => home_url( '/' ),
		'comments' => array(
			array( 'id' => 'public-one', 'type' => 'element', 'verdict' => 'change', 'text' => 'Use the shorter heading.' ),
		),
	),
);

$denied = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
$denied->set_body_params( $payload );
if ( 401 !== rest_do_request( $denied )->get_status() ) {
	throw new RuntimeException( 'Public submission without its nonce was not denied.' );
}

$forged = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
$forged->set_header( 'X-Annotate-Nonce', wp_create_nonce( 'annotate_review_public' ) );
$forged_payload = $payload;
$forged_payload['review']['comments'][0]['proposal']['image'] = array( 'attachment' => array( 'id' => 1 ) );
$forged->set_body_params( $forged_payload );
if ( 400 !== rest_do_request( $forged )->get_status() ) {
	throw new RuntimeException( 'Public staging accepted an image proposal.' );
}

for ( $i = 0; $i < 5; ++$i ) {
	$request = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
	$request->set_header( 'X-Annotate-Nonce', wp_create_nonce( 'annotate_review_public' ) );
	$request->set_body_params( $payload );
	$response = rest_do_request( $request );
	if ( 201 !== $response->get_status() ) {
		throw new RuntimeException( 'Valid public staging review was not stored.' );
	}
	$result = $response->get_data();
	if ( null !== $result['adminUrl'] || null !== $result['exportUrl'] || 'private' !== get_post_status( $result['id'] ) ) {
		throw new RuntimeException( 'Public response exposed a private management URL.' );
	}
	$stored = json_decode( get_post_meta( $result['id'], '_annotate_review_json', true ), true );
	if ( null !== $stored['submission']['submittedBy'] ) {
		throw new RuntimeException( 'Anonymous submission was recorded as an authenticated user.' );
	}
}

$limited = new WP_REST_Request( 'POST', '/annotate/v1/reviews' );
$limited->set_header( 'X-Annotate-Nonce', wp_create_nonce( 'annotate_review_public' ) );
$limited->set_body_params( $payload );
if ( 429 !== rest_do_request( $limited )->get_status() ) {
	throw new RuntimeException( 'Public staging submission limit was not enforced.' );
}

remove_filter( 'pre_wp_mail', '__return_true' );
delete_transient( $ip_key );
delete_transient( 'annotate_review_site_limit' );
echo "WordPress public staging test passed.\n";
