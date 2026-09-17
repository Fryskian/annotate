<?php
/**
 * Plugin Name: Annotate Review
 * Description: Verzamel opmerkingen op je website en verstuur feedback naar de beheerder.
 * Version: 1.3.3
 * Author: reviewjs contributors
 * License: MIT
 * License URI: https://opensource.org/license/mit
 */

defined( 'ABSPATH' ) || exit;

define( 'ANNOTATE_REVIEW_VERSION', '1.3.3' );

function annotate_review_public_mode() {
	return 'staging' === wp_get_environment_type() && '1' === (string) get_option( 'annotate_review_public_staging', '0' );
}

function annotate_review_register_post_type() {
	register_post_type(
		'annotate_review',
		array(
			'labels'             => array(
				'name'          => __( 'Websitefeedback', 'annotate-review' ),
				'singular_name' => __( 'Websitefeedback', 'annotate-review' ),
			),
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => true,
			'show_in_rest'       => false,
			'capability_type'     => 'page',
			'map_meta_cap'       => true,
			'supports'           => array( 'title', 'author' ),
			'menu_icon'          => 'dashicons-format-chat',
		),
	);
}
add_action( 'init', 'annotate_review_register_post_type' );

function annotate_review_register_tour_page() {
	add_submenu_page(
		'edit.php?post_type=annotate_review',
		__( 'Rondleiding', 'annotate-review' ),
		__( 'Rondleiding', 'annotate-review' ),
		'edit_pages',
		'annotate-review-tour',
		'annotate_review_tour_page'
	);
}
add_action( 'admin_menu', 'annotate_review_register_tour_page' );

function annotate_review_tour_page() {
	?>
	<div class="wrap annotate-review-tour-page">
		<header class="fc-header">
			<div class="fc-brand">Forcys <span>Annotate</span></div>
			<button class="button" id="forcys-restart" type="button"><?php esc_html_e( 'Rondleiding opnieuw starten', 'annotate-review' ); ?></button>
		</header>
		<main>
			<p class="fc-kicker"><?php esc_html_e( 'Veilige oefenomgeving', 'annotate-review' ); ?></p>
			<h1><?php esc_html_e( 'Welkom bij Forcys Annotate', 'annotate-review' ); ?></h1>
			<p class="fc-lead"><?php esc_html_e( 'Leer feedback direct op een webpagina te zetten. Je opmerkingen blijven in deze browser en de testknop verstuurt niets.', 'annotate-review' ); ?></p>
			<section class="fc-practice" aria-labelledby="practice-title">
				<h2 id="practice-title"><?php esc_html_e( 'Probeer het hier', 'annotate-review' ); ?></h2>
				<p><?php esc_html_e( 'Selecteer tekst, teken rond een vlak of plaats een pin op een kaart.', 'annotate-review' ); ?></p>
				<div class="fc-grid">
					<article class="fc-card" data-demo-target="pin" data-review-block>
						<strong><?php esc_html_e( 'Nieuwe hero-afbeelding', 'annotate-review' ); ?></strong>
						<p><?php esc_html_e( 'Plaats hier een pin en vertel welke uitstraling beter bij de campagne past.', 'annotate-review' ); ?></p>
					</article>
					<article class="fc-card" data-review-block>
						<strong><?php esc_html_e( 'Een kortere titel', 'annotate-review' ); ?></strong>
						<p><?php esc_html_e( 'Markeer deze woorden en schrijf hoe je de boodschap duidelijker zou maken.', 'annotate-review' ); ?></p>
					</article>
					<article class="fc-card" data-review-block>
						<strong><?php esc_html_e( 'Meer ruimte nodig?', 'annotate-review' ); ?></strong>
						<p><?php esc_html_e( 'Teken een rechthoek of cirkel rond dit vlak en voeg je uitleg toe.', 'annotate-review' ); ?></p>
					</article>
				</div>
			</section>
		</main>
	</div>
	<?php
}

function annotate_review_tour_admin_assets() {
	if ( 'annotate-review-tour' !== sanitize_key( wp_unslash( $_GET['page'] ?? '' ) ) ) {
		return;
	}
	$user = wp_get_current_user();
	annotate_review_enqueue_language();
	wp_enqueue_style( 'annotate-review-tour', plugins_url( 'annotate-review-tour.css', __FILE__ ), array(), ANNOTATE_REVIEW_VERSION );
	wp_enqueue_script( 'annotate-review-tour', plugins_url( 'annotate-review-tour.js', __FILE__ ), array( 'annotate-review-nl' ), ANNOTATE_REVIEW_VERSION, false );
	wp_add_inline_script(
		'annotate-review-tour',
		'window.AnnotateReviewTour=' . wp_json_encode( array( 'mode' => 'practice', 'autostart' => true, 'reviewer' => $user->display_name ) ) . ';',
		'before'
	);
	wp_enqueue_script(
		'annotate-review',
		plugins_url( 'annotate.js', __FILE__ ),
		array( 'annotate-review-tour' ),
		ANNOTATE_REVIEW_VERSION,
		true
	);
}
add_action( 'admin_enqueue_scripts', 'annotate_review_tour_admin_assets' );

function annotate_review_enqueue_language() {
	wp_enqueue_script( 'annotate-review-nl', plugins_url( 'annotate-review-nl.js', __FILE__ ), array(), ANNOTATE_REVIEW_VERSION, false );
}

function annotate_review_enqueue() {
	$authorized = current_user_can( 'edit_pages' );
	$public     = annotate_review_public_mode();
	if ( ! $authorized && ! $public ) {
		return;
	}
	$user = wp_get_current_user();
	annotate_review_enqueue_language();
	wp_enqueue_script(
		'annotate-review-bridge',
		plugins_url( 'annotate-review.js', __FILE__ ),
		array( 'annotate-review-nl' ),
		ANNOTATE_REVIEW_VERSION,
		true
	);
	wp_localize_script(
		'annotate-review-bridge',
		'AnnotateWordPress',
		array(
			'restUrl'     => rest_url( 'annotate/v1/reviews' ),
			'mediaUrl'    => rest_url( 'wp/v2/media' ),
			'nonce'       => wp_create_nonce( $authorized ? 'wp_rest' : 'annotate_review_public' ),
			'nonceHeader' => $authorized ? 'X-WP-Nonce' : 'X-Annotate-Nonce',
			'canUpload'   => $authorized && ! $public && current_user_can( 'upload_files' ),
			'publicMode'  => $public,
			'reviewer'    => array(
				'name'  => $user->display_name,
				'email' => $user->user_email,
			),
		)
	);
	wp_add_inline_script(
		'annotate-review-bridge',
		'window.AnnotateConfig = Object.assign({}, window.AnnotateConfig || {}, {project:' . wp_json_encode( sanitize_title( get_bloginfo( 'name' ) ) ) . '});',
		'before'
	);
	wp_enqueue_script(
		'annotate-review',
		plugins_url( 'annotate.js', __FILE__ ),
		array( 'annotate-review-bridge' ),
		ANNOTATE_REVIEW_VERSION,
		true
	);
	if ( 'staging' === wp_get_environment_type() ) {
		wp_enqueue_style( 'annotate-review-tour', plugins_url( 'annotate-review-tour.css', __FILE__ ), array(), ANNOTATE_REVIEW_VERSION );
		wp_enqueue_script(
			'annotate-review-tour',
			plugins_url( 'annotate-review-tour.js', __FILE__ ),
			array( 'annotate-review' ),
			ANNOTATE_REVIEW_VERSION,
			true
		);
		wp_add_inline_script( 'annotate-review-tour', 'window.AnnotateReviewTour={mode:"frontend",autostart:false};', 'before' );
	}
}
add_action( 'wp_enqueue_scripts', 'annotate_review_enqueue' );

function annotate_review_admin_bar( WP_Admin_Bar $bar ) {
	if ( is_admin() || ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$bar->add_node(
		array(
			'id'    => 'annotate-review',
			'title' => __( 'Feedback op deze pagina', 'annotate-review' ),
			'href'  => '#',
		)
	);
}
add_action( 'admin_bar_menu', 'annotate_review_admin_bar', 90 );

function annotate_review_can_submit( WP_REST_Request $request ) {
	if ( current_user_can( 'edit_pages' ) ) {
		return (bool) wp_verify_nonce( $request->get_header( 'X-WP-Nonce' ), 'wp_rest' );
	}
	return annotate_review_public_mode() && (bool) wp_verify_nonce( $request->get_header( 'X-Annotate-Nonce' ), 'annotate_review_public' );
}

function annotate_review_public_rate_limit() {
	$ip         = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ?? 'unknown' ) );
	$ip_key     = 'annotate_review_ip_' . md5( $ip . wp_salt( 'nonce' ) );
	$site_key   = 'annotate_review_site_limit';
	$ip_count   = (int) get_transient( $ip_key );
	$site_count = (int) get_transient( $site_key );
	if ( $ip_count >= 5 || $site_count >= 50 ) {
		return new WP_Error( 'annotate_rate_limited', __( 'Er is te vaak feedback verstuurd. Probeer het later opnieuw.', 'annotate-review' ), array( 'status' => 429 ) );
	}
	set_transient( $ip_key, $ip_count + 1, HOUR_IN_SECONDS );
	set_transient( $site_key, $site_count + 1, HOUR_IN_SECONDS );
	return true;
}

function annotate_review_submit( WP_REST_Request $request ) {
	$public_request = ! current_user_can( 'edit_pages' ) && annotate_review_public_mode();
	$params         = $request->get_json_params();
	$params         = is_array( $params ) ? $params : $request->get_body_params();
	$review         = isset( $params['review'] ) && is_array( $params['review'] ) ? $params['review'] : null;
	$reviewer = isset( $params['reviewer'] ) && is_array( $params['reviewer'] ) ? $params['reviewer'] : array();
	$name     = sanitize_text_field( $reviewer['name'] ?? '' );
	$email    = sanitize_email( $reviewer['email'] ?? '' );
	$message  = sanitize_textarea_field( $params['message'] ?? '' );

	if ( ! $review || empty( $review['comments'] ) || ! is_array( $review['comments'] ) ) {
		return new WP_Error( 'annotate_empty_review', __( 'Voeg eerst minstens één opmerking toe.', 'annotate-review' ), array( 'status' => 400 ) );
	}
	if ( count( $review['comments'] ) > 500 || strlen( wp_json_encode( $review ) ) > 1024 * 1024 ) {
		return new WP_Error( 'annotate_review_too_large', __( 'Deze feedback is te groot om te versturen.', 'annotate-review' ), array( 'status' => 413 ) );
	}
	if ( ! $name || ! is_email( $email ) ) {
		return new WP_Error( 'annotate_invalid_reviewer', __( 'Vul je naam en een geldig e-mailadres in.', 'annotate-review' ), array( 'status' => 400 ) );
	}

	$url      = esc_url_raw( $review['url'] ?? '' );
	$scheme   = wp_parse_url( $url, PHP_URL_SCHEME );
	$url_host = wp_parse_url( $url, PHP_URL_HOST );
	$our_host = wp_parse_url( home_url(), PHP_URL_HOST );
	if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || ! $url_host || strtolower( $url_host ) !== strtolower( $our_host ) ) {
		return new WP_Error( 'annotate_invalid_url', __( 'De pagina moet bij deze website horen.', 'annotate-review' ), array( 'status' => 400 ) );
	}

	$counts = array( 'keep' => 0, 'change' => 0, 'question' => 0 );
	foreach ( $review['comments'] as $index => $comment ) {
		if ( ! is_array( $comment ) ) {
			return new WP_Error( 'annotate_invalid_comment', __( 'De feedback bevat een ongeldige opmerking.', 'annotate-review' ), array( 'status' => 400 ) );
		}
		if ( 'element' === ( $comment['type'] ?? '' ) ) {
			$verdict = $comment['verdict'] ?? '';
			if ( ! isset( $counts[ $verdict ] ) || ! trim( (string) ( $comment['text'] ?? '' ) ) ) {
				return new WP_Error( 'annotate_invalid_element_comment', __( 'Geef bij elk aangewezen onderdeel een beoordeling en een opmerking.', 'annotate-review' ), array( 'status' => 400 ) );
			}
			++$counts[ $verdict ];
		}

		$has_image     = isset( $comment['proposal']['image'] );
		$attachment_id = absint( $comment['proposal']['image']['attachment']['id'] ?? 0 );
		if ( $has_image && annotate_review_public_mode() ) {
			return new WP_Error( 'annotate_public_images_disabled', __( 'Afbeeldingen uploaden is niet beschikbaar voor bezoekers van de testsite.', 'annotate-review' ), array( 'status' => 400 ) );
		}
		if ( $has_image && ! $attachment_id ) {
			return new WP_Error( 'annotate_invalid_attachment', __( 'De feedback bevat een afbeelding die niet beschikbaar is.', 'annotate-review' ), array( 'status' => 400 ) );
		}
		if ( $attachment_id ) {
			if ( ! wp_attachment_is_image( $attachment_id ) || ! current_user_can( 'edit_post', $attachment_id ) ) {
				return new WP_Error( 'annotate_invalid_attachment', __( 'De feedback bevat een afbeelding die niet beschikbaar is.', 'annotate-review' ), array( 'status' => 400 ) );
			}
			$metadata = wp_get_attachment_metadata( $attachment_id );
			$file     = get_attached_file( $attachment_id );
			$review['comments'][ $index ]['proposal']['image']['attachment'] = array(
				'id'       => $attachment_id,
				'url'      => wp_get_attachment_url( $attachment_id ),
				'filename' => $file ? wp_basename( $file ) : '',
				'mime'     => get_post_mime_type( $attachment_id ),
				'width'    => is_array( $metadata ) ? ( $metadata['width'] ?? null ) : null,
				'height'   => is_array( $metadata ) ? ( $metadata['height'] ?? null ) : null,
			);
		}
	}
	if ( $public_request ) {
		$rate_limit = annotate_review_public_rate_limit();
		if ( is_wp_error( $rate_limit ) ) {
			return $rate_limit;
		}
	}

	$path    = wp_parse_url( $url, PHP_URL_PATH ) ?: '/';
	$post_id = wp_insert_post(
		array(
			'post_type'    => 'annotate_review',
			'post_status'  => 'private',
			'post_author'  => get_current_user_id(),
			'post_title'   => sprintf( __( 'Feedback op %s', 'annotate-review' ), $path ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	$submitter = wp_get_current_user();
	$submitted_by = $submitter->exists()
		? array( 'id' => $submitter->ID, 'name' => $submitter->display_name, 'email' => $submitter->user_email )
		: null;
	$review['submission'] = array(
		'id'          => $post_id,
		'submittedAt' => current_time( 'c', true ),
		'reviewer'    => array( 'name' => $name, 'email' => $email ),
		'submittedBy' => $submitted_by,
		'message'     => $message,
		'counts'      => $counts,
	);
	$json = wp_json_encode( $review, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	if ( false === $json || false === update_post_meta( $post_id, '_annotate_review_json', wp_slash( $json ) ) ) {
		wp_delete_post( $post_id, true );
		return new WP_Error( 'annotate_storage_failed', __( 'De feedback kon niet worden opgeslagen.', 'annotate-review' ), array( 'status' => 500 ) );
	}
	update_post_meta( $post_id, '_annotate_url', $url );
	update_post_meta( $post_id, '_annotate_counts', $counts );
	update_post_meta( $post_id, '_annotate_message', $message );

	$edit_url   = admin_url( 'post.php?post=' . $post_id . '&action=edit' );
	$export_url = $public_request ? null : wp_nonce_url(
		admin_url( 'admin-post.php?action=annotate_review_export&review=' . $post_id ),
		'annotate_review_export_' . $post_id
	);
	$recipient = sanitize_email( get_option( 'annotate_review_recipient', get_option( 'admin_email' ) ) );
	$recipient = $recipient ?: sanitize_email( get_option( 'admin_email' ) );
	$subject   = sprintf( __( 'Website review #%d ontvangen', 'annotate-review' ), $post_id );
	$sender    = $submitted_by
		? sprintf( __( '%1$s <%2$s> heeft feedback op de website verstuurd.', 'annotate-review' ), $submitter->display_name, $submitter->user_email )
		: sprintf( __( '%1$s <%2$s> heeft feedback via de testsite verstuurd.', 'annotate-review' ), $name, $email );
	$body      = implode(
		"\n",
		array(
			$sender,
			sprintf( __( 'Contactpersoon: %1$s <%2$s>', 'annotate-review' ), $name, $email ),
			$url,
			$message,
			sprintf( __( 'Behouden: %1$d | Aanpassen: %2$d | Vragen: %3$d', 'annotate-review' ), $counts['keep'], $counts['change'], $counts['question'] ),
			$edit_url,
		)
	);
	try {
		$mail_sent = (bool) wp_mail( $recipient, $subject, $body );
	} catch ( \Throwable $error ) {
		// The review is already stored. A broken mail transport must not invite resubmission.
		$mail_sent = false;
	}
	update_post_meta( $post_id, '_annotate_notification_status', $mail_sent ? 'accepted' : 'failed' );

	return new WP_REST_Response(
		array(
			'id'        => $post_id,
			'mailSent'  => $mail_sent,
			'adminUrl'  => $public_request ? null : $edit_url,
			'exportUrl' => $export_url,
		),
		201
	);
}

function annotate_review_register_routes() {
	register_rest_route(
		'annotate/v1',
		'/reviews',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'permission_callback' => 'annotate_review_can_submit',
			'callback'            => 'annotate_review_submit',
		),
	);
}
add_action( 'rest_api_init', 'annotate_review_register_routes' );

function annotate_review_export() {
	$post_id = absint( $_GET['review'] ?? 0 );
	$post    = get_post( $post_id );
	if ( ! $post || 'annotate_review' !== $post->post_type || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'Je kunt deze feedback niet downloaden.', 'annotate-review' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( 'annotate_review_export_' . $post_id );
	nocache_headers();
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="annotate-review-' . $post_id . '.json"' );
	header( 'X-Content-Type-Options: nosniff' );
	echo get_post_meta( $post_id, '_annotate_review_json', true ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON download, never HTML.
	exit;
}
add_action( 'admin_post_annotate_review_export', 'annotate_review_export' );

function annotate_review_settings() {
	register_setting(
		'general',
		'annotate_review_recipient',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_email',
			'default'           => get_option( 'admin_email' ),
		)
	);
	add_settings_field(
		'annotate_review_recipient',
		__( 'Ontvanger van websitefeedback', 'annotate-review' ),
		'annotate_review_recipient_field',
		'general'
	);
	register_setting(
		'general',
		'annotate_review_public_staging',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'annotate_review_sanitize_public_staging',
			'default'           => '0',
		)
	);
	add_settings_field(
		'annotate_review_public_staging',
		__( 'Feedback van bezoekers op de testsite', 'annotate-review' ),
		'annotate_review_public_staging_field',
		'general'
	);
}
add_action( 'admin_init', 'annotate_review_settings' );

function annotate_review_recipient_field() {
	$value = get_option( 'annotate_review_recipient', get_option( 'admin_email' ) );
	printf(
		'<input class="regular-text" type="email" name="annotate_review_recipient" value="%s" required><p class="description">%s</p>',
		esc_attr( $value ),
		esc_html__( 'Ontvangt een link en samenvatting wanneer iemand feedback verstuurt.', 'annotate-review' )
	);
}

function annotate_review_sanitize_public_staging( $value ) {
	return 'staging' === wp_get_environment_type() && $value ? '1' : '0';
}

function annotate_review_public_staging_field() {
	$staging = 'staging' === wp_get_environment_type();
	printf(
		'<label><input type="checkbox" name="annotate_review_public_staging" value="1" %s %s> %s</label><p class="description">%s</p>',
		checked( get_option( 'annotate_review_public_staging', '0' ), '1', false ),
		disabled( $staging, false, false ),
		esc_html__( 'Laat bezoekers opmerkingen plaatsen en feedback versturen', 'annotate-review' ),
		esc_html( $staging
			? __( 'Afbeeldingen uploaden is uitgeschakeld. Er geldt een limiet voor het versturen van feedback. Ingediende feedback is niet openbaar.', 'annotate-review' )
			: __( 'Alleen beschikbaar wanneer WP_ENVIRONMENT_TYPE op staging staat.', 'annotate-review' ) )
	);
}

function annotate_review_add_meta_box() {
	add_meta_box(
		'annotate-review-summary',
		__( 'Ingediende feedback', 'annotate-review' ),
		'annotate_review_meta_box',
		'annotate_review',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes_annotate_review', 'annotate_review_add_meta_box' );

function annotate_review_meta_box( WP_Post $post ) {
	$data       = json_decode( get_post_meta( $post->ID, '_annotate_review_json', true ), true );
	$submission = is_array( $data ) ? ( $data['submission'] ?? array() ) : array();
	$counts     = $submission['counts'] ?? array();
	$url        = get_post_meta( $post->ID, '_annotate_url', true );
	$message    = get_post_meta( $post->ID, '_annotate_message', true );
	$export_url = wp_nonce_url(
		admin_url( 'admin-post.php?action=annotate_review_export&review=' . $post->ID ),
		'annotate_review_export_' . $post->ID
	);
	echo '<p><strong>' . esc_html__( 'Pagina:', 'annotate-review' ) . '</strong> <a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p>';
	echo '<p><strong>' . esc_html__( 'Van:', 'annotate-review' ) . '</strong> ' . esc_html( $submission['reviewer']['name'] ?? '' ) . ' &lt;' . esc_html( $submission['reviewer']['email'] ?? '' ) . '&gt;</p>';
	echo '<p><strong>' . esc_html__( 'Beoordelingen:', 'annotate-review' ) . '</strong> ' . esc_html( sprintf( 'Behouden %d · Aanpassen %d · Vragen %d', $counts['keep'] ?? 0, $counts['change'] ?? 0, $counts['question'] ?? 0 ) ) . '</p>';
	if ( $message ) {
		echo '<p><strong>' . esc_html__( 'Bericht:', 'annotate-review' ) . '</strong><br>' . nl2br( esc_html( $message ) ) . '</p>';
	}
	echo '<p><a class="button button-primary" href="' . esc_url( $export_url ) . '">' . esc_html__( 'Feedback downloaden (JSON)', 'annotate-review' ) . '</a></p>';
}

function annotate_review_disable_block_editor( $use_block_editor, $post_type ) {
	return 'annotate_review' === $post_type ? false : $use_block_editor;
}
add_filter( 'use_block_editor_for_post_type', 'annotate_review_disable_block_editor', 10, 2 );
